"use strict";

var os   = require("os");
var fs   = require('fs');
var path = require ('path');
var util = require ('util');

var EventEmitter = require('events').EventEmitter;

var common          = require ('./common');

var nodeToJavaPlatform = {
	darwin: 'macos',
	win32: 'windows',
	linux: 'linux'
};

var javaToNodePlatform = {};
for (var platformName in nodeToJavaPlatform) {
	javaToNodePlatform[nodeToJavaPlatform[platformName]] = platformName;
}

var os = require ('os');

var javaPlatformName = nodeToJavaPlatform [os.platform()];

var Arduino = function (userDirs) {

	// TODO: additional user dirs
	if (Arduino.instance)
		return Arduino.instance;

	// useful for reloading
	this.init (userDirs);

	this.boardData = {};
	this.boardDataKV = {};
	this.libraryData = {};

	this.on ('done', this.storeBoardsData.bind (this));
	this.on ('done', this.storeLibraryData.bind (this));

	this.on ('done', (function () {
		Arduino.instance = this;
	}).bind (this));

}

util.inherits (Arduino, EventEmitter);

Arduino.prototype.init = function (userDirs) {
	userDirs = appendStandardLocations ('runtime', userDirs);
	userDirs = appendStandardLocations ('user',    userDirs);

	// we must find correct arduino ide location.
	// we assume [arduino ide]/hardware/tools contains avr-gcc and so on
	// TODO: linux path resolve

	this.processDirs ('all', userDirs);
}

var ioWait = 0;
Arduino.prototype.ioDone = function (tag, dir) {
	var self = this;
	ioWait++;
//	console.log ('ioWait++', tag || 'done', dir);
	return function () {
		ioWait --;
//		console.log ('ioWait--', tag || 'done', dir);
		if (!ioWait)
			setTimeout (function () {
				if (!ioWait)
					self.emit ('done'); // tags is not supported
			}, 100);
	}.bind (this);
}


Arduino.prototype.processDirs = function (type, dirs) {

	var self = this;

	dirs.forEach (function (dirStr) {
        var dir = path.resolve (dirStr);
		fs.stat (path.join (dir, 'hardware'),  self.enumerateHardware.bind  (self, path.join (dir, 'hardware'), self.ioDone ('hardware', dir)));
		fs.stat (path.join (dir, 'libraries'), self.enumerateLibraries.bind (self, path.join (dir, 'libraries'), self.ioDone ('libraries', dir)));
		// TODO: enumerateExamples
		//		fs.stat (path.join (dir, 'examples'),  self.enumerateExamples.bind  (self, path.join (dir, 'examples'), self.ioDone ()));
	});
}



function appendStandardLocations (type, locations) {

	locations = locations || [];

	if (locations.constructor !== Array) {
		if (locations.constructor === String) {
			locations = [locations];
		} else {
			console.log (arguments);
			cb ("first argument must be a path string or an array of paths");
		}
	}

	// 1.0 /Applications/Arduino.app/Contents/Resources/Java/hardware/arduino/boards.txt
	// 1.5 /Applications/Arduino.app/Contents/Java/hardware/arduino/avr/boards.txt

	// default application folders:
	if (type === 'runtime') {
		if (os.platform () === 'darwin') {
			locations.forEach (function (location, idx) {
				locations[idx] = location.replace (/Arduino\.app\/?$/, "Arduino.app/Contents/Java")
			});
			locations.push ("/Applications/Arduino.app/Contents/Java");
		} else if (os.platform () === 'win32') {
			locations.push ("C:/Program Files/Arduino");
            locations.push ("C:/Program Files (x86)/Arduino");
		}

		if (!locations.length)
			return;

        console.log ('[brackets-cuwire] search for runtime within:', locations.join (", "));
		return locations;
	}

	if (type !== 'user') {
		return;
	}

	// default user folders:
	function getUserHome() {
		return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
	}

	// TODO: read preference file ~/Library/Arduino15/preferences.txt
	locations.push (path.join (getUserHome(), "Documents/Arduino"));

    console.log ('[brackets-cuwire] search for sketches within:', locations.join (", "));
	return locations;
}


Arduino.prototype.parseConfig = function (cb, section, err, data) {
	if (err) {
		cb (err);
		return;
	}

	var boards = {};
	var keyValue = {};

	data.toString ().split ('\n').forEach (function (line) {
		if (line.indexOf("#") === 0) return;
		if (line.length === 0) return;
		// console.log (line);
		var ref = line.substring (0, line.indexOf ('='));
		// TODO: menu handling
		if (ref.match (/^menu/)) return;
		var value = line.substring (line.indexOf ('=')+1);
		var refs = ref.split('.');
		keyValue[ref] = value;

		if (refs[refs.length-1] === javaPlatformName) {
			refs.pop ();
			ref = refs.join ('.');
		} else if (refs[refs.length-1] in javaToNodePlatform) {
			return;
		}

		var root = boards;
		if (refs.length === 4 && refs[1] === "menu") {
			ref += "."+refs[2] + '_modification';
		}
		common.pathToVar (root, ref, value);
	});
//	console.log (Object.keys (boards));
	cb (null, section, boards, keyValue);
}

Arduino.prototype.enumerateLibraries = function (fullPath, done, err, data) {

	if (err) {
		done ('libraries');
		return;
	}

	common.pathWalk (fullPath, foundMeta, {
		nameMatch: (os.platform() === "win32"
            ? /.*\\(examples|.+\.cp{0,2}|.+\.h)$/i
            : /.*\/(examples|.+\.cp{0,2}|.+\.h)$/i
        )
	});

	var self = this;

	var data = {};


	function foundMeta (err, files) {
		if (err && !files) {
			done ('libraries');
			return;
		}

		var remains = Object.keys (files).length;

		Object.keys (files).forEach (function (fileName) {
			if (fileName.match (/examples$/)) {
				remains --;
				// TODO: enumerateExamples
				//fs.stat (fileName,  self.enumerateExamples.bind  (self, fileName, self.ioDone ()));
				return;
			}
			var relativePath = fileName.substr (fullPath.length + 1);
//			console.log (relativePath.match (/[^\/]+/));
			var libName = relativePath.match (/[^\/\\]+/)[0];
//			console.log ('found lib', libName);
			// TODO: user and runtime can have libraries with same name. prefer user ones
			if (!self.libraryData[libName])
				self.libraryData[libName] = {
					files: {},
					requirements: {}
					// root: path.join (fullPath, libName)
				};
			if (relativePath.toLowerCase() === path.join (libName.toLowerCase(), libName.toLowerCase()+'.h')) {
				// Arduino 1.0 styled lib
				self.libraryData[libName].root = path.join (fullPath, libName);
				self.libraryData[libName].include = path.join (fullPath, libName);
			} else if (relativePath.toLowerCase() === path.join (libName.toLowerCase(), 'src', libName.toLowerCase()+'.h')) {
				self.libraryData[libName].root = path.join (fullPath, libName);
				self.libraryData[libName].include = path.join (fullPath, libName, 'src');
				self.libraryData[libName].version = '1.5';
			}
//			console.log ('library: relpath', relativePath, 'libname', libName, 'root', self.libraryData[libName].root);
			var relativeSrcPath = relativePath.substr (libName.length+1);
			self.libraryData[libName].files[relativeSrcPath] = true;
			fs.readFile (fileName, function (err, data) {
				remains --;

				// TODO: hackish solution by using prototype
				var libNames = Arduino.prototype.parseLibNames (data);

				libNames.forEach (function (req) {
					self.libraryData[libName].requirements[req] = true;
				});

				if (remains === 0)
					done ('libraries');
			});
		});
		if (remains === 0)
			done ('libraries');
	}
}

Arduino.prototype.enumerateHardware = function (fullPath, done, err, data) {

	if (err) {
		done ('hardware');
		return;
	}

	common.pathWalk (fullPath, foundMeta, {
		nameMatch: (os.platform() === "win32"
            ? /.*\\(tools|libraries|boards.txt|platform.txt)$/i
            : /.*\/(tools|libraries|boards.txt|platform.txt)$/i
        )
	});

	var self = this;

	var remains = 0;

	function foundMeta (err, files) {
		if (err && !files) {
			done ('hardware');
			return;
		}
//		console.log (Object.keys (files).join ("\n"));
		Object.keys (files).forEach (function (fileName) {
			var relativePath = fileName.substr (fullPath.length + 1);
			// var libName = relativePath.match (/[^\/]+/)[0];
//			console.log (relativePath, relativePath.match (/[^\/]+\/[^\/]+\/libraries/));
//			console.log (relativePath);
			if (relativePath === "tools") {
				self.runtimeDir = fullPath.replace (path.sep+'hardware', "");
				return;
			}
			var pathChunks = relativePath.split (path.sep);
			if (pathChunks.length > 3) {
				// something wrong
				console.log ('SOMETHING WRONG');
			}
			var vendor     = pathChunks[0];
			var arch       = pathChunks[1];
			var localFile  = pathChunks[2];

			var platformId = [vendor, arch].join (':');
			if (!self.boardData[platformId])
				self.boardData[platformId] = {
					folders: {
						root: path.join (fullPath, vendor, arch),
						arch: arch,
						vendor: vendor
					},
					libraryData: {}
				};
			self.boardDataKV[platformId] = {
				"folders.root": path.join (fullPath, vendor, arch),
				"folders.arch": arch,
				"folders.vendor": vendor,
				libraryData: {}
			};

			if (localFile === 'libraries') {
				// TODO: little hackish
				fs.stat (fileName,  self.enumerateLibraries.bind  (self.boardData[platformId], fileName, self.ioDone ('libraries', fileName)));
				return;
			}
			var type = localFile.replace ('.txt', '');
			var readCb = function (err, type, fileData, keyValue) {
				remains --;
				if (err) {
					console.log ('read error for', fileName);
					return;
				}

				self.boardData[platformId][type]   = fileData;
				self.boardDataKV[platformId][type] = keyValue;

				if (type === 'platform') {
					common.pathToVar (
						self.boardData[platformId][type],
						"build.system.path",
						path.join (fullPath, vendor, arch, 'system')
					);
					common.pathToVar (
						self.boardData[platformId][type],
						"build.core.path",
						path.join (fullPath, vendor, arch, 'cores')
					);
					common.pathToVar (
						self.boardData[platformId][type],
						"build.variant.path",
						path.join (fullPath, vendor, arch, 'variants')
					);
					common.pathToVar (
						self.boardData[platformId][type],
						"runtime.platform.path",
						path.join (fullPath, vendor, arch)
					);
					common.pathToVar (
						self.boardData[platformId][type],
						"runtime.hardware.path",
						path.join (fullPath, vendor)
					);
				}

				if (remains)
					return;
				// self.boardData = data;
				done ('hardware');
				//					arduinoBoardsDone (cb, data);
			};
			fs.readFile (fileName, self.parseConfig.bind (self, readCb, type));
			remains ++;

		});
	}
}



Arduino.prototype.storeBoardsData = function () {
	fs.writeFile (
		path.join (__dirname, "../generated/arduino.json"),
		JSON.stringify (this.boardData, null, '\t'),
		function (err) {}
	);
}

Arduino.prototype.loadBoardsData = function () {
	fs.readFile (path.join (__dirname, "../generated/arduino.json"), (function (err, data) {
		if (err) {
			this.emit ('error', err);
			return;
		}
		try {
			this.boardData = JSON.parse (data.toString());
		} catch (e) {
			this.emit ('error', e);
		}
	}).bind (this));
}


Arduino.prototype.storeLibraryData = function () {
	fs.writeFile (
		path.join (__dirname, "../generated/libraries.json"),
		JSON.stringify (this.libraryData, null, '\t'),
		function (err) {}
	);
}

Arduino.prototype.loadLibraryData = function () {
	fs.readFile (path.join (__dirname, "../generated/libraries.json"), (function (err, data) {
		if (err) {
			this.emit ('error', err);
			return;
		}
		try {
			this.boardData = JSON.parse (data.toString());
		} catch (e) {
			this.emit ('error', e);
		}
	}).bind (this));
}

function createTempFile (cb) {

	var crypto = require('crypto');
	var fileName = path.join (os.tmpdir (), 'me.apla.arduino.'+crypto.randomBytes(4).readUInt32LE(0));

	fs.mkdir (fileName, function (err) {
		// TODO: make something on error
		if (err) {
			return;
		}
		cb ();
	});

}




Arduino.prototype.findLib = function (platformId, libName) {
//	console.log (this.libraryData, this.boardData[platformId].libraryData, platformId, libName);
//	libName = libName.toLowerCase();
	var libMeta = this.libraryData[libName] || this.boardData[platformId].libraryData[libName];
//	if (!libMeta) {
//		console.log ('can\'t find library', libName, 'in library folders (TODO: show library folder names)');
//	}
	if (!libMeta) return libMeta;
	var libMetaClone = JSON.parse (JSON.stringify (libMeta));
	return libMetaClone;
}

Arduino.prototype.parseLibNames = function (fileContents, platformId) {
	// let's find all #includes
	var includeRe = /^\s*#include\s+["<]([^>"]+)\.h[">]/gm;
	var matchArray;
	var libNames = [];

	while ((matchArray = includeRe.exec (fileContents)) !== null) {
		var libName = matchArray[1];
		if (platformId === undefined) {
			libNames.push (libName);
		} else if (this.findLib (platformId, libName)) {
			libNames.push (libName);
		}

	}
	return libNames;
}

// TODO: use memoize
Arduino.prototype.platformPath = function (platformId) {
	return path.join (platformId.split (':'));
}

module.exports = Arduino;
