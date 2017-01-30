var EventEmitter = require("events");
var fs = require("fs");
var request = require("request");
var mongoose = require("mongoose");

var IdCollection = require("../src/models/idcollection");

var apiKey = require("../src/config")["apiKey"];
var mongoURL = require("../src/config")["mongoURL"];

// config in this dir contains the last parsed summoner id
// this will prevent a lot of redundancy
var currentSumId = Number(fs.readFileSync("./currentSumId").toString());




var queueTypes = ["RANKED_SOLO_5x5"];

mongoose.connect(mongoURL);


//========== Begin Code of Controller Event Emitter =========//

// **** Request Controller should be called Request Receiver as it
// actually controls nothing but all catches various events

// requestController will handle data received from
// automated interval
var requestController = new EventEmitter();

requestController["currentIterations"] = 0;

requestController["currentSumId"] = currentSumId;

// debug code below:
//console.log(JSON.parse(fs.readFileSync("./divisionsAndTiers.json")));
//return 1;
// extract divisions and tiers and statuses of completion: (will have separate function to map non completed)
requestController["divisionsAndTiers"] = filterNonFinishedDivsAndTiers(JSON.parse(fs.readFileSync("./divisionsAndTiers.json").toString()));
//console.log(requestController["divisionsAndTiers"]);
//return 1;

requestController["writeStreams"] = {
	currentSumId: fs.createWriteStream("./currentSumId"),
	divisionsAndTiers: fs.createWriteStream("./divisionsAndTiers.json")
};

requestController["reqInterval"] = setInterval(function(){
	handleRequest(this.currentSumId, this.divisionsAndTiers);
},1500);

requestController.on("request", function(error, data) {
	//delete me later:
	console.log("Request complete!");
	//increment summonerid by appropriate number:
	this.currentSumId += 33;

	// increment counter
	this.currentIterations++;


	if (error) {
		console.log("error!");
		console.log(error);
	}

	else {
		// call DB function, updateDB will emit response rather than use a callback here
		console.log("calling db!");
		updateDB(data);
	}

	/*

	// format of data object

	data {
	sumIds: [123456,353993....]
	division: "Silver",
	tier: "II"
	}

	*/



});


// this event fired when database functionality is finished post request
requestController.on("dbFinish", function(error, divAndTier) {
	console.log("db fin called");

	if (error) {
		// maybe switch to logging, since these error imply database failure (crucial point)
		return console.log(error);
	}

	else if (divAndTier["completed"] === true) {

		// modify this.divsAndTiers to negate redundancy functionality ***

		// lookup by index rather than iteration, since I'm fancy
		var divAndTierMarker = {
			tier: divAndTier["tier"],
			division: divAndTier["division"]
		};

		var index = this.divisionAndTiers.indexOf(divAndTierMarker);

		this.divisionAndTiers[index]["completed"] = true;

	}

	else {
		console.log(divAndTier);
		console.log("The above object has been updated or saved successfully!");
	}

})



// fired when the process is disrupted
requestController.on("processExiting", function(code) {
	clearInterval(this.reqInterval);
	console.log(`Process exiting with code of: ${code}`);
	console.log(`Now saving last summoner id used: ${this.currentSumId}`);

	this.writeStreams.currentSumId.write(String(this.currentSumId));
	this.writeStreams.currentSumId.close();

	this.writeStreams.divisionsAndTiers.write(JSON.stringify(this.divisionsAndTiers));
	this.writeStreams.divisionsAndTiers.close();

	console.log("Progress has been saved successfully!");
	console.log("Process going down in one second!");
	setTimeout(function(){
		process.exit(1);
	},1000);

})


// This will catch any Ctrl+C or other kill signal sent to the program
// this is important to keep track of our progress
process.on("SIGINT", function(code) {

	requestController.emit("processExiting", code);

})


// This handleRequest call is to test a valid summoner id
//handleRequest(19887289, requestController.divisionsAndTiers);



//========== Begin Code of Interval and Api Request Function ===============//



function handleRequest(sumId, divsAndTiers){

request("https://na.api.pvp.net/api/lol/na/v2.5/league/by-summoner/" + sumId + "?" + apiKey, function(error, response, body) {

	if (error || response.statusCode !== 200) {
		console.log("Error with request!");
		return requestController.emit("request", "Failed to process request.");
	}

	else {
		var output = JSON.parse(body);

		for (var  i = 0; i < output[sumId].length; ++i) {

			console.log(queueTypes);
			console.log(output[sumId][i]["queue"]);

			if (queueTypes.includes(output[sumId][i]["queue"])) {

				var quickInd = output[sumId][i];

				var divAndTier = {
					tier: quickInd["tier"],
         	division: quickInd["entries"][0]["division"],
					sumIds: []
         };


				 var shortHandCheck = quickInd["tier"].substr(0,1) + quickInd["entries"][0]["division"];

				 console.log(shortHandCheck);

				 //console.log(divsAndTiers);

         for (var j = 0; j < divsAndTiers.length; ++j) {

				 	if (divsAndTiers[j]["shortHand"] == shortHandCheck) {

						for (var j = 0; j < quickInd["entries"].length; ++j) {

						divAndTier["sumIds"].push(quickInd["entries"][j]["playerOrTeamId"]);

					 	}

					}
				}
         return requestController.emit("request", null, divAndTier);
        }


			}

		}

		return requestController.emit("request", "No Data to process!");


})

}



//========== Function to map non-completed divisions and tiers ==============//

function filterNonFinishedDivsAndTiers(arr) {

	return arr.filter(function(divAndTier) {
		if (divAndTier["completed"] === false)
			return {tier: divAndTier["tier"], division: divAndTier["division"]};
	})

}



//=========== Database Functionality ===============//

function updateDB(data) {

	console.log("db func called");

	/*var addAndSaveResults = function(divAndTier, sumIds) {

		sumIds.forEach(function(sumId) {
			divAndTier["summonerIds"].push(sumId);
		})

		IdCollection.update({division: divAndTier["division"], tier: divAndTier["tier"]}, divAndTier, function(error, updated) {
			if (error) return requestController.emit("dbFinish", error);
			else requestController.emit("dbFinish", null, updated);
		})

	}*/

	IdCollection.findByDivisionAndTier(data["division"], data["tier"], function(error, divAndTier) {
		console.log("cb rdy!");

		if (error) {
			console.log("db err");
			console.log(error);
			return requestController.emit("dbFinish", error)
		}

		else if (!divAndTier) {
			console.log("stuff being created for db")
			var divAndTier = new IdCollection();
			divAndTier["division"] = data["division"];
			divAndTier["tier"] = data["tier"];
			divAndTier["summonerIds"] = [];

			data["sumIds"].forEach(function(sumId) {
				if (divAndTier["summonerIds"].length >= 200) {
					divAndTier["completed"] = true;
					return requestController.emit("dbFinish", null, updated);
				}
				divAndTier["summonerIds"].push(sumId);
			})

			divAndTier.save();

			return requestController.emit("dbFinish", null, divAndTier);

		}

		else {
			console.log("more sumIds being added to db");
			data["sumIds"].forEach(function(sumId) {
				if (divAndTier["summonerIds"].length >= 200) {
					divAndTier["completed"] = true;
					return requestController.emit("dbFinish", null, updated);
				}
				divAndTier["summonerIds"].push(sumId);
			})

			IdCollection.update({division: divAndTier["division"], tier: divAndTier["tier"]}, divAndTier, function(error, updated) {
				if (error) return requestController.emit("dbFinish", error);
				else requestController.emit("dbFinish", null, updated);
			})

		}

	})

}


setTimeout(function(){
	console.log("fin");
}, 10000000);
