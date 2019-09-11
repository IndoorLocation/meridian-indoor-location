var _ = require('lodash');
var MapwizeApi = require("mapwize-node-api");
var program = require("commander");
var request = require("request-promise");
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

module.exports = (async () => {
    
    try {
        console.log('- Retrieving Meridian Maps');

        var options = {
            method: 'GET',
            url: program.meridianDomain + '/api/locations/' + program.meridianLocation + '/maps',
            headers:
                { Authorization: 'Token ' + program.meridianToken }
        };

        await request(options, (err, response, body) => {
            if (err) {
                throw (err);
            } else {
                if (response.statusCode != "200") {
                    console.log(error)("Meridian http request status code should be 200.");
                } else {
                    meridianMaps = JSON.parse(body).results;
                }
            }
        });
        
        console.log('- Getting Mapwize raster sources');

        const sources = await mapwizeAPI.getVenueSources(program.mapwizeVenue);
        rasterSources = _.filter(sources, ["type", "raster"]);

        // Create (if not exists) a rasterSource in Mapwize with name "Meridian | {map name}"

        for(const maps of meridianMaps ) {
            var rasterSource = _.find(rasterSources, ["name", "Meridian | " + maps.name])

            try {
                if(!rasterSource) {
                    const info = await mapwizeAPI.createRasterSource(program.mapwizeVenue, { name: "Meridian | " + maps.name.toString() });
                    maps.rasterId = info._id;
                } else {
                    maps.rasterId = rasterSource._id
                }
            } catch (error) {
                throw Errorconsole.log('CREATE RASTER', error)
            }   
        }

        console.log('- Downloading SVG images from Meridian');

        for(const maps of meridianMaps) {
            var options = {
                method: 'GET',
                url: program.meridianDomain + '/api/locations/' + program.meridianLocation + '/maps/' + maps.id + '.svg',
                headers:
                    { Authorization: 'Token ' + program.meridianToken }
            };
            try {
                await request(options, (err, response, body) => {
                    if (err) {
                        throw (err);
                    } else {
                        if (response.statusCode != "200") {
                            console.log(error)("Meridian http request status code should be 200.");
                        } else {
                            maps.img = body
                        }
                    }
                });
                
            } catch (error) {
                throw Error('DOWLOAD ERR', error)
            }  
        }

        console.log("- Converting svg to png")

        for(const maps of meridianMaps) {
            try {
                const image = await svgToImg.from(maps.img).toPng();
                maps.img = image;
            } catch (error) {
                throw Error('PNG ERR', error)
            }
        }

        console.log("- Uploading png images to raster sources")

        for(const maps of meridianMaps) {
            try {
                await mapwizeAPI.setRasterSourcePng(program.mapwizeVenue, maps.rasterId, maps.img);                
            } catch (error) {
                console.log('UPLOAD ERR', error)
            }
        };

        console.log("- Run Raster Sources setup job")

        for(const maps of meridianMaps) {
            try {            
                await mapwizeAPI.runRasterSourceSetupJob(program.mapwizeVenue, maps.rasterId)            
            } catch (error) {
                throw Error('RUN RASTER ERR', error)
            }
        };

        console.log("- Setting raster sources georeferences from Meridian if available")

        for(const maps of meridianMaps) {
            if (maps.gps_ref_points) {

                var dimensions = sizeOf(maps.img);
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
                try {
                    await mapwizeAPI.setRasterSourceConfig(program.mapwizeVenue, maps.rasterId, { georeference: georeference });                    
                } catch (error) {
                    throw Error('GEOREFERENCE ERR', error)
                }
            } 
        };

    } catch (error) {
        console.log(error)
    }
})();