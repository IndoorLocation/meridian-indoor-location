var _ = require('lodash');
var async = require('async');
var MapwizeApi = require("mapwize-node-api");
var program = require("commander");
var request = require("request");
var svgToImg = require("svg-to-img");
var sizeOf = require('image-size');

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
                    meridianMaps = JSON.parse(body).results;
                    next()
                }
            }
        });
    },

    next => {
        console.log('- Getting Mapwize raster sources');

        mapwizeAPI.getVenueSources(program.mapwizeVenue, (err, sources) => {
            if (err) {
                next(err);
            } else {
                rasterSources = _.filter(sources, ["type", "raster"])
                next();
            }
        });
    },

    // Create (if not exists) a rasterSource in Mapwize with name "Meridian | {map name}"
    next => {
        console.log('- Creating or updating raster sources in Mapwize');

        async.eachOfSeries(meridianMaps, function (maps, i, callback) {
            var rasterSource = _.find(rasterSources, ["name", "Meridian | " + maps.name])

            if (!rasterSource) {
                mapwizeAPI.createRasterSource(program.mapwizeVenue, { name: "Meridian | " + maps.name.toString() }, function (err, info) {
                    if (err) {
                        callback(err)
                    } else {
                        maps.rasterId = info._id
                        callback();
                    }
                });
            } else {
                maps.rasterId = rasterSource._id
                callback()
            }

        }, next);
    },

    next => {
        console.log('- Downloading SVG images from Meridian');

        async.eachOfSeries(meridianMaps, function (maps, i, callback) {

            var options = {
                method: 'GET',
                url: program.meridianDomain + '/api/locations/' + program.meridianLocation + '/maps/' + maps.id + '.svg',
                headers:
                    { Authorization: 'Token ' + program.meridianToken }
            };

            request(options, function (error, response, body) {
                if (error) {
                    callback(err);
                } else {
                    if (response.statusCode != "200") {
                        callback("Meridian http request status code should be 200.");
                    } else {
                        maps.img = body
                        callback()
                    }
                }
            });

        }, next);
    },

    next => {
        console.log("- Converting svg to png")

        await async.eachOfSeries(meridianMaps, async (maps) => {
            const image = await svgToImg.from(maps.img).toPng();
            maps.img = image;
        });
        next();
    },

    next => {
        console.log("- Uploading png images to raster sources")

        async.eachOfSeries(meridianMaps, function (maps, i, callback) {
            mapwizeAPI.setRasterSourcePng(program.mapwizeVenue, maps.rasterId, maps.img, function (err, infos) {
                if (err) {
                    callback(err)
                } else {
                    callback()
                }
            })
        }, next);
    },

    next => {
        console.log("- Run Raster Sources setup job")

        async.eachOfSeries(meridianMaps, function (maps, i, callback) {
            mapwizeAPI.runRasterSourceSetupJob(program.mapwizeVenue, maps.rasterId, function (err, infos) {
                if (err) {
                    callback(err)
                } else {
                    callback()
                }
            })
        }, next);
    },

    next => {
        console.log("- Setting raster sources georeferences from Meridian if available")

        async.eachOfSeries(meridianMaps, function (maps, i, callback) {
            if (maps.gps_ref_points) {

                var dimensions = sizeOf(new Buffer(maps.img));
                var georef = maps.gps_ref_points.split(",")
                var georeference = {
                    points: [
                        {
                            latitude: georef[0],
                            longitude: georef[1],
                            x: georef[4],
                            y: dimensions.height-georef[5]
                        },
                        {
                            latitude: georef[2],
                            longitude: georef[3],
                            x: georef[6],
                            y: dimensions.height-georef[7]
                        }
                    ]
                };

                mapwizeAPI.setRasterSourceConfig(program.mapwizeVenue, maps.rasterId, { georeference: georeference }, callback);
            } else {
                callback()
            }
        }, next);
    },

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