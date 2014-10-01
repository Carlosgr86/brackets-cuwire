/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, node: true */
/*global */

(function () {
	"use strict";

	var os = require("os");
	var fs   = require('fs');
	var path = require ('path');


	var Arduino = require ('./arduino');

	var theArduino;

	function getBoardsMeta (locations) {

		var cb = arguments[arguments.length-1];

		if (!theArduino) {
			theArduino = new Arduino (locations);

			theArduino.on ('done', function () {
				cb (null, theArduino.boardData);
			});
		} else {
			cb (null, theArduino.boardData);
		}
	}

	function arduinoBoardsDone (cb, boards) {
		fs.writeFile (
			path.join (__dirname, "../arduino.json"),
			JSON.stringify (boards, null, '\t'),
			function (err) {
				if (err) cb (err);
				cb (null, boards);
			});
	}

	/**
	 * function to enumerate serial ports
	 * @return {array} path names
	 */
	function enumerateSerialPorts () {
//		console.log (os);

		var cb = arguments[arguments.length-1];

		var serialport;
		try {
			// https://github.com/voodootikigod/node-serialport
			// HOWTO built THAT on mac (got idea from https://github.com/jasonsanjose/brackets-sass/tree/master/node):
			// 1) cd <extension-folder>/node; npm install node-gyp node-pre-gyp serialport
			// 2) cd node_modules/serialport
			// 3) /Applications/devel/Brackets.app/Contents/MacOS/Brackets-node ../../node_modules/node-pre-gyp/bin/node-pre-gyp --arch=ia32 rebuild
			serialport = require("serialport");
		} catch (e) {
			cb ("cannot load serialport module"+e);
			return;
		}

		var err, result = [];
		serialport.list(function (err, ports) {
			ports.forEach(function(port) {
				result.push (port.comName);
//				console.log(port.comName);
//				console.log(port.pnpId);
//				console.log(port.manufacturer);
			});
			cb (err, result);
		});

//		var SerialPort = serialport.SerialPort;
//		var serialPort = new SerialPort("/dev/tty-usbserial1", {
//			baudrate: 57600
//		});

	}

	/**
	* Initializes the domain
	* @param {DomainManager} domainManager The DomainManager for the server
	*/
	function init(domainManager) {
		if (!domainManager.hasDomain("arduino")) {
			domainManager.registerDomain("arduino", {major: 0, minor: 1});
		}
		domainManager.registerCommand(
			"arduino",       // domain name
			"enumerateSerialPorts",    // command name
			enumerateSerialPorts,   // command handler function
			true,          // this command is asynchronous in Node
			"Enumerate all serial ports",
			[],
			[{name: "ports", // return values
			  type: "array",
			  description: "serial port path names"}]
		);
		domainManager.registerCommand(
			"arduino",       // domain name
			"getBoardsMeta",    // command name
			getBoardsMeta,   // command handler function
			true,          // this command is asynchronous in Node
			"get arduino boards metadata",
			[{
				name: "dirs",
				type: "array",
				description: "directory list to search within"
			}],
			[{name: "boards", // return values
			  type: "object",
			  description: "board data"}]
		);
	}

	exports.init = init;

}());
