'use strict';

var hsAPIWrapper = require('hubspot-api-wrapper');
var options = {
	'authEntryPoint': '/authorize',
	'authExitPoint': '/',
	'cookieName': 'access_token',
	'client_id': process.env['CLIENT_ID'],
	'client_secret': process.env['CLIENT_SECRET'],
	'redirect_uri': process.env['REDIRECT_URI'],
	'hapikey': process.env['HAPIKEY']
}
var HS = hsAPIWrapper(options);
HS.options = options;
HS._ = {
	properties: function(){
		return [
			HS.api({
				method: 'GET',
				url: 'properties/v1/deals/properties'
			}),
			function(req, res, next){
				var properties = res.apiResponse.body;
				var pIndex, property;
				var output = {};
				for(pIndex = 0; pIndex < properties.length; pIndex++){
					property = properties[pIndex];
					output[property.name] = {
						name: property.name,
						label: property.label,
						type: property.type,
						fieldType: property.fieldType
					};
				}
				res.properties = output;
				next();
			}
		]
	},
	stages: function(){
		return [
			HS.api({
				method: 'GET',
				url: 'deals/v1/pipelines/default'
			}),
			function(req, res, next){
				res.stages = res.apiResponse.body.stages._mapToObject(function(object, stage){
					object[stage.stageId] = stage.label;
				});
				next();
			}
		]
	},
	deals: function(){
		return [
			function(req, res, next){
				var Today = (new Date())._toArray();
				var snapshotDate = new Date(
					(parseInt(req.query.year) || Today[0]),
					(parseInt(req.query.month) || Today[1]),
					(parseInt(req.query.day) || Today[2])
				);
				var propertyNames = Array
					._fromCSV(req.query.properties)
					._addIfDoesNotInclude('createdate')
					._addIfDoesNotInclude('hs_createdate')
					._addIfDoesNotInclude('dealname')
					._addIfDoesNotInclude('dealstage')
					._intersectionWith(Object.keys(res.properties));
				
				req.snapshot = {
					propertyNames: propertyNames,
					date: snapshotDate,
					dateAsNumber: snapshotDate.getTime()
				}
				next();
			},
			function(req, res, next){
				req.offset = 0;
				req.numPerRequest = 250;

				res.deals = [];

				loadMoreDeals();

				function loadMoreDeals(){
					var apiRequest = HS.api({
						method: 'GET',
						url: 'deals/v1/deal/paged',
						qsStringifyOptions: {
							arrayFormat: 'repeat'
						},
						qs: {
							limit: req.numPerRequest,
							offset: req.offset,
							properties: req.snapshot.propertyNames,
							propertiesWithHistory: true
						}
					});
					apiRequest(req, res, actionAfterAPIResponse);
				}

				function actionAfterAPIResponse(){
					var apiResponse = res.apiResponse.body;
					res.deals = res.deals.concat(apiResponse.deals);
					if(!apiResponse.hasMore || req.query.limitToFirst){
						next();
					}else{
						req.offset = apiResponse.offset;
						loadMoreDeals();
					}
				}
			},
			function(req, res, next){
				if(Array._fromCSV(req.query.properties).indexOf('hs_createdate') < 0){
					req.snapshot.propertyNames._remove('hs_createdate');
				}
				res.deals = res.deals.filter(removeYoungDeals);
				res.deals = res.deals.map(stripDeal);
				next();

				function removeYoungDeals(deal){
					var dealCreateDate = parseInt(deal.properties.createdate.value);
					return (dealCreateDate <= req.snapshot.dateAsNumber);
				}

				function stripDeal(deal){
					var output = {};
					var pIndex, pLength, propertyName, property;
					var targetVersion, versionDate;
					var dateAddedToHS = deal.properties.hs_createdate.timestamp;
					var timeTolerance = 2000;
					for(pIndex = 0; pIndex < req.snapshot.propertyNames.length; pIndex++){
						propertyName = req.snapshot.propertyNames[pIndex];
						property = deal.properties[propertyName];
						if(property){
							if(property.versions._last().timestamp - dateAddedToHS <= timeTolerance){
								targetVersion = property.versions._last();
							}else{
								targetVersion = property.versions.filter(getCorrectVersion)[0];
							}
							if(targetVersion){
								versionDate = new Date(targetVersion.timestamp);
								output[propertyName] = {
									value: formatPropertyValue(targetVersion.value, propertyName),
									time: versionDate.toLocaleString()
								}
							}
						}
					}
					output.dealId = deal.dealId;
					return output;
				}

				function getCorrectVersion(propertyVersion){
					return (propertyVersion.timestamp <= req.snapshot.dateAsNumber);
				}

				function formatPropertyValue(propertyValue, propertyName){
					var propertyType = res.properties[propertyName].type;
					if(propertyName == 'dealstage'){
						return res.stages[propertyValue];
					}else if(propertyType == 'date' || propertyType == 'datetime'){
						return (new Date(parseInt(propertyValue)))._toArray().join('-');
					}else if(propertyType == 'number'){
						return parseFloat(propertyValue);
					}else if(propertyType == 'string'){
						return (propertyValue || '').replace(/\t/g, ' ');
					}else{
						return propertyValue;
					}
				}
			}
		];
	}
}

module.exports = HS;
