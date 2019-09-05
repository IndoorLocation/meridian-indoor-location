var _ = require('lodash');
var async = require('async');
var MapwizeApi = require("mapwize-node-api");
var program = require("commander");
var request = require("request");
const svgToImg = require("svg-to-img");
var sizeOf = require('image-size');

program
    .option("-o, --mapwizeOrganization <organizationId>", "Mapwize Organization Id")
    .option("-v, --mapwizeVenue <venueId>", "Mapwize Venue Id")
    .option("-a, --mapwizeApiKey <apiKey>", "Mapwize api key (with write permission)")
    .option("-l, --meridianLocation <locationId>", "Meridian Location Id")
    .option("-t, --meridianToken <token>", "Meridian Auth Token")
    .option("-d, --meridianDomain <domain>", "Meridian Domain - default edit.meridianapps.com")
    .option("-s, --serverUrl <serverUrl>", "Server url - default mapwize.io")
    .parse(process.argv)

if (!program.mapwizeOrganization || !program.mapwizeVenue || !program.mapwizeApiKey || !program.meridianLocation || !program.meridianToken || !program.meridianDomain || !program.serverUrl) {
    console.log("Arguments --organizationId, --venueId, --apiKey, --meridianLocation, --meridianToken, --meridianDomain and --serverUrl are required");
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
                    meridianData = JSON.parse(body).results;
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
                rasterSources = _.filter(sources, ["type", "raster"])
                next();
            }
        });
    },

    // Create (if not exists) a rasterSource in Mapwize with name "Meridian | {map name}"
    next => {
        console.log('- Create a rasterSource if not exists');

        async.eachOfSeries(meridianData, function (data, i, callback) {
            var rasterSource = _.find(rasterSources, ["name", "Meridian | " + data.name])

            if (!rasterSource) {
                var floor = data.name.split(" ")[1];
                if (floor == "RDD") {
                    floor = 0;
                } else if (floor.includes("SS")) {
                    floor = "-" + floor.substr(2)
                }
                mapwizeAPI.createRasterSource(program.mapwizeVenue, { name: "Meridian | " + data.name.toString(), floor: floor }, function (err, info) {
                    if (err) {
                        callback(err)
                    } else {
                        data.rasterId = info._id
                        callback();
                    }
                });
            } else {
                data.rasterId = rasterSource._id
                callback()
            }

        }, function (err) {
            if (err) {
                next(err);
            } else {
                next();
            }
        });
    },

    // Download the SVG from the map from Meridian
    next => {
        console.log('- Download all SVG from Meridian map');

        async.eachOfSeries(meridianData, function (data, i, callback) {

            var options = {
                method: 'GET',
                url: 'https://edit-eu.meridianapps.com/api/locations/' + program.meridianLocation + '/maps/' + data.id + '.svg',
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
    },

    // Convert the svg to png
    next => {
        console.log("- Convert svg to png")

        const launchConvert = async () => {
            await async.eachOfSeries(meridianData, async (data) => {
                const image = await svgToImg.from(data.img).toPng();
                data.img = image;
            });
            next()
        }
        launchConvert();
    },

    // Upload png
    next => {
        console.log("- Upload png to the raster source")

        async.eachOfSeries(meridianData, function (data, i, callback) {
            mapwizeAPI.setRasterSourcePng(program.mapwizeVenue, data.rasterId, data.img, function (err, infos) {
                if (err) {
                    callback(err)
                } else {
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
        console.log("- Run setup job")

        async.eachOfSeries(meridianData, function (data, i, callback) {
            mapwizeAPI.runRasterSourceSetupJob(program.mapwizeVenue, data.rasterId, function (err, infos) {
                if (err) {
                    callback(err)
                } else {
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
        console.log("- Create georeference if exist")

        async.eachOfSeries(meridianData, function (data, i, callback) {
            if (data.gps_ref_points) {

                var dimensions = sizeOf(new Buffer(data.img));

                var georef = data.gps_ref_points.split(",")

                var georeference = {
                    points: [
                        {
                            longitude: georef[1],
                            latitude: georef[0],
                            x: georef[4],
                            y: dimensions.height-georef[5]
                        },
                        {
                            longitude: georef[3],
                            latitude: georef[2],
                            x: georef[6],
                            y: dimensions.height-georef[7]
                        }
                    ]
                }
                mapwizeAPI.setRasterSourceConfig(program.mapwizeVenue, data.rasterId, { georeference: georeference }, function (err, infos) {
                    if (err) {
                        callback(err)
                    } else {
                        callback()
                    }
                })
            } else {
                callback()
            }
        }, function (err) {
            if (err) {
                next(err);
            } else {
                next();
            }
        });
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
                        longitude: gps_ref_points[1],
                        latitude: gps_ref_points[0],
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