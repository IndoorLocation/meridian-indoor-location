# Meridian Indoor Location

This repository provides scripts to align maps in Meridian and Mapwize to ensure that the location provided by Meridian match with the Mapwize Indoor Maps.

### Prerequisites:

- Have a Meridian account with your maps as SVG files
- Have an Application Token configured in Meridian allowing to read and write app maps
- Have a Mapwize accout with a venue
- Have a API KEY configured in Mapwize with write permission on the venue

## 1) Import all your Meridian maps in Mapwize

Use the script

```shell
node meridian_maps_to_mapwize.js --mapwizeOrganization <organizationId> --mapwizeVenue <venueId> --mapwizeApiKey <apiKey> --meridianLocation <locationId> --meridianToken <token> --meridianDomain <domain>
```

MeridianDomain is by default `edit.meridianapps.com` but you can change it to `edit-eu.meridianapps.com` for example.

This script will create a raster source in Mapwize for each map in Meridian.

## 2) Align the maps in Mapwize

Use Mapwize Studio to properly georeference all the raster sources.

Please make sure to keep the source name in the format "Meridian | {map name in Meridian}"

## 3) Georeference the maps in Meridian

Use the script

```shell
node georeference_meridian_with_mapwize.js --mapwizeOrganization <organizationId> --mapwizeVenue <venueId> --mapwizeApiKey <apiKey> --meridianLocation <locationId> --meridianToken <token> --meridianDomain <domain>
```

This will update the gps_ref_points for all your maps in Meridian based on Mapwize data.