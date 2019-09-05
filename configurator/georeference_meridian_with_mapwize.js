var _ = require('lodash');
var async = require('async');
var MapwizeApi = require("mapwize-node-api");
var program = require("commander");
var request = require("request");

program
    .option("-o, --mapwizeOrganization <organizationId>", "Mapwize Organization Id")
    .option("-v, --mapwizeVenue <venueId>", "Mapwize Venue Id")
    .option("-a, --mapwizeApiKey <apiKey>", "Mapwize api key (with write permission)")
    .option("-s, --mapwizeServerUrl <serverUrl>", "Server url - default https://api.mapwize.io")
    .option("-l, --meridianLocation <locationId>", "Meridian Location Id")
    .option("-t, --meridianToken <token>", "Meridian Auth Token")
    .option("-d, --meridianDomain <domain>", "Meridian Domain - default https://edit.meridianapps.com")
    .parse(process.argv)

if (!program.mapwizeOrganization || !program.mapwizeVenue || !program.mapwizeApiKey || !program.meridianLocation || !program.meridianToken) {
    console.log("Arguments --organizationId, --venueId, --apiKey, --meridianLocation and --meridianToken are required");
    process.exit(1);
}

if (!program.mapwizeServerUrl) {
    program.mapwizeServerUrl = 'https://api.mapwize.io';
}

if (!program.meridianDomain) {
    program.meridianDomain = 'https://edit.meridianapps.com';
}

//Mapwize API
const mapwizeAPI = new MapwizeApi(program.mapwizeApiKey, program.mapwizeOrganization, { serverUrl: program.mapwizeServerUrl });

var meridianMaps;
var rasterSources;

async.series([

  next => {
    console.log('- Retrieving Meridian Maps');
        
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
          meridianMaps = JSON.parse(body).results
          next()
        }
      }

    });
  },

  //  Get list of raster sources for venue in Mapwize
  next => {
    console.log('- Getting Mapwize raster sources');

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
    console.log('- Getting georeference for raster sources');

    async.eachOf(rasterSources, function (data, i, callback) {

      mapwizeAPI.getRasterSourceConfig(program.mapwizeVenue, data._id, function (err, infos) {
        if (err) {
          callback(err)
        } else {
          data.georeference = infos.georeference;
          callback()
        }
      })
    }, next);
  },

  next => {
    console.log('- Geting params from raster sources');

    async.eachOf(rasterSources, function (data, i, callback) {

      mapwizeAPI.getRasterSourceParams(program.mapwizeVenue, data._id, function (err, infos) {
        if (err) {
          callback(err)
        } else {
          data.bbox = infos.bbox;
          callback()
        }
      })
    }, next);
  },

  next => {
    console.log('- Updating georeference in Meridian');

    async.eachOf(rasterSources, function (data, i, nextSource) {

      var meridianMap = _.find(meridianMaps, function (o) { return o.name == data.name.split("Meridian | ")[1] });
      
      if (meridianMap) {

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

        var options = {
          method: 'PUT',
          url: program.meridianDomain + 'api/locations/' + program.meridianLocation + '/maps/' + meridianMap.id,
          headers:
            { Authorization: 'Token ' + program.meridianToken },
          body:
            { gps_ref_points: georef.join(',') },
          json: true
        };

        request(options, function (error, response, body) {
          if (error) {
            nextSource(err);
          } else {
            if (response.statusCode != "200") {
              nextSource("Meridian http request status code should be 200.");
            } else {
              nextSource()
            }
          }
        });
      } else {
        nextSource();
      }
    }, next);
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