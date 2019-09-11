var _ = require('lodash');
var MapwizeApi = require("mapwize-node-api");
var program = require("commander");
var request = require("request-promise");

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

      await request(options, function (error, response, body) {
        if (error) {
          throw error;
        } else {
          if (response.statusCode != "200") {
            throw Error("Meridian http request status code should be 200.");
          } else {
            meridianMaps = JSON.parse(body).results;
          }
        }
      });

      //  Get list of raster sources for venue in Mapwize

      console.log('- Getting Mapwize raster sources');

      const sources = await mapwizeAPI.getVenueSources(program.mapwizeVenue)      
      rasterSources = _.filter(sources, data =>  data.type == "raster" && data.name.includes("Meridian | "))

      console.log('- Getting georeference for raster sources');

      for(const data of rasterSources) {
        const infos = await mapwizeAPI.getRasterSourceConfig(program.mapwizeVenue, data._id) 
        data.georeference = infos.georeference;
      }

      console.log('- Geting params from raster sources');

      for(const data of rasterSources) {
        const infos = await mapwizeAPI.getRasterSourceParams(program.mapwizeVenue, data._id)
        data.bbox = infos.bbox;         
      }

      console.log('- Updating georeference in Meridian');

      for(const data of rasterSources) {

        var meridianMap = _.find(meridianMaps, o =>  o.name == data.name.split("Meridian | ")[1]);
        
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

          await request(options,(error, response, body) => {
            if (error) {
              throw error;
            } else {
              if (response.statusCode != "200") {
                throw Error("Meridian http request status code should be 200.");
              } 
            }
          });
        } 
      }
          

  } catch (error) {
    console.log(error)
  }

})();