var _ = require('lodash');
var async = require('async');
var MapwizeApi = require("mapwize-node-api");
var program = require("commander");
var request = require("request");

program
  .option("-o, --mapwizeOrganization <organizationId>", "Mapwize Organization Id")
  .option("-v, --mapwizeVenue <venueId>", "Mapwize Venue Id")
  .option("-a, --mapwizeApiKey <apiKey>", "Mapwize api key (with write permission)")
  .option("-l, --meridianLocation <locationId>", "Meridian Location Id")
  .option("-t, --meridianToken <token>", "Meridian Auth Token")
  .option("-d, --meridianDomain <domain>", "Meridian Domain - default edit.meridianapps.com")
  .option("-s, --serverUrl <serverUrl>", "Server url - default mapwize.io")

  .parse(process.argv)

if (!program.mapwizeOrganization || !program.mapwizeVenue || !program.mapwizeApiKey || !program.meridianLocation || !program.meridianToken || !program.meridianDomain) {
  console.log("Arguments --organizationId, --venueId, --apiKey, --meridianLocation, --meridianToken and --meridianDomain are required");
  process.exit(1);
}

//Mapwize API
const mapwizeAPI = new MapwizeApi(program.mapwizeApiKey, program.mapwizeOrganization, { serverUrl: program.serverUrl });

var meridianData;
var rasterSources;

async.series([

  // Get list of maps for Location from Meridian
  next => {
    console.log('- Retrives Meridian data');

    var options = {
      method: 'GET',
      url: program.meridianDomain + '/api/locations/' + program.meridianLocation + '/maps',
      headers:
        { Authorization: 'Token ' + program.meridianToken }
    };

    request(options, function (error, response, body) {
      if (error) {
        next(err);
      } else {
        if (response.statusCode != "200") {
          next("Meridian http request status code should be 200.");
        } else {
          meridianData = JSON.parse(body).results
          next()
        }
      }

    });
  },

  //  Get list of raster sources for venue in Mapwize
  next => {
    console.log('- Get all sources');

    mapwizeAPI.getVenueSources(program.mapwizeVenue, (err, sources) => {
      if (err) {
        next(err);
      } else {
        rasterSources = _.filter(sources, function (data) { return data.type == "raster" && data.name.includes("Meridian | ") })
        next();
      }
    });
  },

  next => {
    console.log('- Get georeference from raster source');

    async.eachOf(rasterSources, function (data, i, callback) {

      mapwizeAPI.getRasterSourceConfig(program.mapwizeVenue, data._id, function (err, infos) {
        if (err) {
          callback(err)
        } else {
          data.georeference = infos.georeference;
          callback()
        }
      })
    }, function (err) {
      if (err) {
        next(err);
      } else {
        next();
      }
    });
  },

  next => {
    console.log('- Get params from raster source');

    async.eachOf(rasterSources, function (data, i, callback) {

      mapwizeAPI.getRasterSourceParams(program.mapwizeVenue, data._id, function (err, infos) {
        if (err) {
          callback(err)
        } else {
          data.bbox = infos.bbox;
          callback()
        }
      })
    }, function (err) {
      if (err) {
        next(err);
      } else {
        next();
      }
    });
  },

  next => {
    console.log('- Update georeference');

    async.eachOf(rasterSources, function (data, i, callback) {


      var georef = [
        data.georeference.points[0].latitude,
        data.georeference.points[0].longitude,
        data.georeference.points[1].latitude,
        data.georeference.points[1].longitude,
        data.georeference.points[0].x,
        data.bbox[3]-data.georeference.points[0].y,
        data.georeference.points[1].x,
        data.bbox[3]-data.georeference.points[1].y
      ];

      var mapId = _.find(meridianData, function (o) { return o.name == data.name.split("Meridian | ")[1] }).id

      var options = {
        method: 'PUT',
        url: 'https://edit-eu.meridianapps.com/api/locations/' + program.meridianLocation + '/maps/' + mapId,
        headers:
          { Authorization: 'Token ' + program.meridianToken },
        body:
          { gps_ref_points: georef.join(',') },
        json: true
      };
      
      request(options, function (error, response, body) {
        if (error) {
          callback(err);
        } else {
          if (response.statusCode != "200") {
            callback("Meridian http request status code should be 200.");
          } else {
            data.img = body
            callback()
          }
        }
      });
    }, function (err) {
      if (err) {
        next(err);
      } else {
        next();
      }
    });

  }

], function (err) {
  if (err) {
    console.log('ERR', err);
    process.exit(1);
  }
  else {
    console.log('DONE');
    process.exit(0);
  }
});

// 1) Get list of maps for Location from Meridian
// https://edit-eu.meridianapps.com/api/locations/{{Location ID}}/maps
// Header Authorization = Token {meridianToken}

// 2) Get list of raster sources for venue in Mapwize

/*
   3) For each raster source in Mapwize with name in format "Meridian | {map name}"
        - Get meridian {map Id} from {map name}
        - Update gps_ref_points in the map object in Meridian 
          PUT https://edit-eu.meridianapps.com/api/locations/{{Location ID}}/maps/{{Map ID}}
          with just the JSON
          {
        	"gps_ref_points": "48.88974940602677,2.2493344986198736,48.889514709374936,2.2495410887287335,62,49.5,1366,954"
          }
          var gps_ref_points = [
              georeference.points[0].longitude,
              georeference.points[0].latitude,
              georeference.points[1].longitude,
              georeference.points[1].latitude,
              georeference.points[0].x,
              georeference.points[0].y,
              georeference.points[1].x,
              georeference.points[1].y
          ]
*/