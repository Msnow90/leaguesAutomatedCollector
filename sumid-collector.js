var EventEmitter = require("events");
var fs = require("fs");
var request = require("request");

var IdCollection = require("../src/models/idcollection");
var apiKey = require("../src/config")["apiKey"];

// config in this dir contains the last parsed summoner id
// this will prevent a lot of redundancy
var currentSumId = require("./currentSumId");




var queueTypes = ["RANKED_SOLO_5x5"];



//========== Begin Code of Controller Event Emitter =========//

// **** Request Controller should be called Request Receiver as it
// actually controls nothing but all catches various events

// requestController will handle data received from
// automated interval
var requestController = new EventEmitter();

requestController["currentSumId"] = currentSumId;

// extract divisions and tiers and statuses of completion: (will have separate function to map non completed)
requestController["divisionsAndTiers"] = filterNonFinishedDivsAndTiers(JSON.parse(fs.readFileSync("./divisionsAndTiers.json").toString()));


requestController["reqInterval"] = setInterval(handleRequest(this.currentSumId, this.divisionsAndTiers),1000);

requestController.on("request", function(error, data) {

	//increment summonerid by appropriate number:
	this.currentSumId += 8;

	/* 

	// format of data object

	data {
	sumId: 123456,
	division: "Silver",
	tier: "II"
	}

	*/



});

requestController.on("processExiting", function(code) {
	console.log(`Process exiting with code of: ${code}`);
	console.log(`Now saving last summoner id used: ${this.currentSumId}`);

	var ws = fs.createWriteStream("./config.js");

	ws.write("module.exports = " + this.currentSumId);
	ws.close();

	var ws2 = fs.createWriteStream("./divisionsAndTiers.json");
	ws.write(JSON.stringify(divisionsAndTiers));

	console.log("Progress has been saved successfully!");

})



// This will catch any Ctrl+C or other kill signal sent to the program
// this is important to keep track of our progress
process.on("exit", function(code) {

	requestController.emit("processExiting", code);

})




//========== Begin Code of Interval and Api Request Function ===============//



function handleRequest(sumId){

request("https://na.api.pvp.net/api/lol/na/v2.5/league/by-summoner/" + sumId + "?" + apiKey, function(error, response, body) {

	if (error || response.statusCode !== 200) {
		return requestController.emit("request", "Failed to process request.");
	}

	else {
		var output = JSON.parse(body);

		for (var  i = 0; i < output[sumId].length; ++i) {

			if (queueTypes.includes(output[sumId]["queue"])) {

				var divAndTier = {
					tier: output[sumId][i]["tier"],
         			division: output[sumId][i]["entries"][0]["division"]
         		};



			}

		}

	}

})

}



//========== Function to map non-completed divisions and tiers ==============//

function filterNonFinishedDivsAndTiers(arr) {

	return arr.filter(function(divAndTier) {
		if (divAndTier["completed"] === false) 
			return divAndTier;
	})

}


