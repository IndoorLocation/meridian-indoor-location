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
   3) For each map in Meridian:
        - create (if not exists) a rasterSource in Mapwize with name "Meridian | {map name}"
        - download the SVG from the map from Meridian https://edit-eu.meridianapps.com/api/locations/{{Location ID}}/maps/{{Map ID}}.svg (use Auth header)
        - convert the SGV to png using svg2png module
            var svgBuffer = new Buffer(svg, "utf8")
            fs.writeFileSync(path.resolve(__dirname , 'map.png'), svg2png.sync(svgBuffer));
        - upload the png to the raster source + run setup job
        - if the meridian map object contains gps_ref_points, use that to create a georeference (The first four values are the longitude and latitude GPS coordinates for the two reference points. The last four values are the X and Y coordinates for the two reference points on the map.)
            var georeference = {
                points: [
                    {
                        longitude: gps_ref_points[0], 
                        latitude: gps_ref_points[1],
                        x: gps_ref_points[4],
                        y: gps_ref_points[5]
                    },
                    {
                        longitude: gps_ref_points[2], 
                        latitude: gps_ref_points[3],
                        x: gps_ref_points[6],
                        y: gps_ref_points[7]
                    }
                ]
            }
*/