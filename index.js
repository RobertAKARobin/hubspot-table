var express = require('express');
var bodyParser = require('body-parser');
var http = require('http');
var cookieParser = require('cookie-parser');
var path = require('path');
var dotenv = require('dotenv');

if(process.env['NODE_ENV'] != 'production'){
	dotenv.config();
	process.env.PORT = 3000;
	process.env['NODE_ENV'] = 'development';
	console.log('Dev environment');
}

var HS = require('./hs.api');
var httpServer = express();
var baseServer = http.createServer(httpServer);

baseServer
	.listen(process.env.PORT, function(){
		console.log(Date().toLocaleString())
	});

httpServer
	.use(cookieParser())
	.use(bodyParser.json())
	.get(HS.options.authEntryPoint, HS.auth.init)
	.get('/authorize/redirect', HS.auth.redirect)
	.get('/authorize/reset', HS.auth.reset)
	.use('/', express.static('./public'))
	.get('*', HS.auth.check)
	.use('/', express.static('./views'))
	.get('/owners',
		HS.api({
			method: 'GET',
			url: 'owners/v2/owners'
		}),
		function(req, res, next){
			res.json(res.apiResponse);
		}
	)
