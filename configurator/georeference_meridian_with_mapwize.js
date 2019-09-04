var _ = require('lodash');
var async = require('async');
var svg2png = require("svg2png");
var MapwizeApi = require("mapwize-node-api");
var program = require("commander");

program
    .option("-o, --mapwizeOrganization <organizationId>", "Mapwize Organization Id")
    .option("-v, --mapwizeVenue <venueId>", "Mapwize Venue Id")
    .option("-a, --mapwizeApiKey <apiKey>", "Mapwize api key (with write permission)")
    .option("-l, --meridianLocation <locationId>", "Meridian Location Id")
    .option("-t, --meridianToken <token>", "Meridian Auth Token")
    .option("-d, --meridianDomain <domain>", "Meridian Domain - default edit.meridianapps.com")
    .parse(process.argv)

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