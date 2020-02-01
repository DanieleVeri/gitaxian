/*************************************************************** MKM API */
var utils = {};
utils.debug = false;

utils.get = async function(keys, path, data, headers, tokens){
	return await utils.__mkmrequest(keys, 'GET', path, data, headers);
};

utils.post = async function(keys, path, data, headers, tokens){
	return await utils.__mkmrequest(keys, 'POST', path, data, headers);
};

utils.__mkmrequest = async function(keys, method, path, data, headers, tokens){

	if(data){
		for(var k in data){
			if(typeof data[k] === 'string'){
				data[k] = data[k].replace(/\'/g, ' ');
			}
		}
	}
	if(tokens){
		keys.access_token = tokens.access_token;
		keys.access_token_secret = tokens.access_token_secret;
	}

	var oauth_header = await getOauthHeader(method, path, {
		oauth_version : '1.0',
		oauth_timestamp: Math.round(Date.now() / 1000),
		oauth_nonce: generateNonce(),
		oauth_signature_method: 'HMAC-SHA1',
		oauth_consumer_key: keys.app_key,
		oauth_token: keys.access_token || ''
	}, data, keys);
	if(!headers) {
		headers = {};
	}
    headers['Authorization'] = oauth_header;


	const host= utils.debug ? 'sandbox.cardmarket.com' : 'api.cardmarket.com'

	if (method === "GET") {
		var str = [];
		for(var k in data) {
			str.push(k + '=' + urlencode(data[k]));
		}
		path += '?' + str.join('&')
		return await fetch(`https://${host}${path}`, {
			method: method,
			headers
		})
	}
	else if (method === "POST") {
		return await fetch(`https://${host}${path}`, {
			method: method,
			headers,
			body: data ? JSON.stringify(data) : undefined
		})
	}


};

async function getOauthHeader(method, path, params, data, keys){
	var header = `OAuth realm="${getUri(path)}",`;
	for(var k in params){
		header += k + '="' + params[k] +'",';
    }

	var signature = await getSignature(method, path, params, data, keys);
    header += `oauth_signature="${signature[1]}"`;
	return header;
}

utils.getOauthHeader = getOauthHeader;

function getUri(path){
	return 'https://' + (utils.debug ? 'sandbox.cardmarket.com' : 'api.cardmarket.com' ) + path.split('?')[0];
}

function _arrayBufferToBase64( buffer ) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
}

async function hmac_sha1(key, text) {
    var enc = new TextEncoder();

    const k = await window.crypto.subtle.importKey(
        "raw", // raw format of the key - should be Uint8Array
        enc.encode(key),
        { // algorithm details
            name: "HMAC",
            hash: {name: "SHA-1"}
        },
        false, // export = false
        ["sign", "verify"])
    const signature = await window.crypto.subtle.sign(
        "HMAC",
        k,
        enc.encode(text))

    return _arrayBufferToBase64(signature)
}

async function getSignature(method, path, params, data, keys){
    var str = getFinalString(method, path, params, data);
	var signing_key = getSigningKey(keys);

	return [str, await hmac_sha1(signing_key, str)];
}
utils.getSignature = getSignature;

function urlencode(string) {
    var char, charCode, i;
    var encodedString = '';

    for (i=0; i<string.length; i++) {
      char = string.charAt(i);
      if ((char >= '0' && char <= '9') ||
        (char >= 'A' && char <= 'Z') ||
        (char >= 'a' && char <= 'z') ||
        (char == '-') || (char == '.') ||
        (char == '_') || (char == '~')) {
        encodedString += char;
      } else {
        charCode = string.charCodeAt(i);
        encodedString += '%' + charCode.toString(16).toUpperCase();
      }
    }
    return encodedString;
}

utils.buildParams = function (params, data){
	params = makeParams(params, data);
	var str = [];
	for(var k in params){
		str.push(k + '=' + urlencode(params[k].toString()));
	}
	const str_params = str.join('&');

	return str_params;
}

function getFinalString(method, path, params, data){
	var uri = getUri(path);
	var str = method + '&' + urlencode(uri) + '&';
    str += urlencode(utils.buildParams(params, data));
	return str;
}
utils.getFinalString = getFinalString;

function getSigningKey(keys){
	return urlencode(keys.secret) + '&' + (keys.access_token_secret ? urlencode(keys.access_token_secret) : '');
}
utils.getSigningKey = getSigningKey;

function makeParams(params, data){
	const needed_params = ['consumer_key','token','nonce','timestamp','signature_method','version'];
	for(var k in data){
		params[k] = data[k];
	}
    params = sortObject(params);
	for(var k of needed_params){
		if(!(('oauth_' + k) in params)){
			params[('oauth_' + k)] = '';
		}
	}
	return params;
}

function sortObject(obj){
	var sorted = Object.keys(obj);
	sorted.sort(function(a, b){
		if(a > b) return 1;
		if(a < b) return -1;
		return 0;
	});
	var ret = {};
	for(var k of sorted){
		ret[k] = obj[k];
	}
	return ret;
}

function generateNonce(){
	function s4(){
		return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
	}

	return `${s4()}${s4()}${s4()}`;
}

function MkmApiClient(key, secret){
	this.app_key = key;
	this.app_secret = secret;
}

MkmApiClient.prototype.debug = function(){
	utils.debug = !utils.debug;
	return utils.debug;
};

MkmApiClient.prototype.get = async function(path, data, headers, tokens){
	return await utils.get({
		app_key: this.app_key,
		secret: this.app_secret,
		access_token: this.access_token || undefined,
		access_token_secret: this.access_token_secret || undefined
	}, path, data, headers, tokens);
};

MkmApiClient.prototype.post = async function(path, data, headers, tokens){
	return await utils.post({
		app_key: this.app_key,
		secret: this.app_secret,
		access_token: this.access_token || undefined,
		access_token_secret: this.access_token_secret || undefined
	}, path, data, headers, tokens);
};

MkmApiClient.prototype.request = async function(method, path, data, headers, tokens){
	return await utils.__mkmrequest({
		app_key: this.app_key,
		secret: this.app_secret,
		access_token: this.access_token || undefined,
		access_token_secret: this.access_token_secret || undefined
	}, method, path, data, headers, tokens);
};

MkmApiClient.prototype.setAccessTokens = function(access_token, access_token_secret){
	this.access_token = access_token;
	this.access_token_secret = access_token_secret;
};

/********************************************************************************** Main */

async function main() {
	// MKM API
	let apikey = document.getElementById('apikey').value
	let apisec = document.getElementById('apisec').value
	let accesskey = document.getElementById('accesskey').value
	let accesssec = document.getElementById('accesssec').value
	if (apikey.length * apisec.length * accesskey.length * accesssec.length === 0) {
		alert("Compila i campi in alto a destra con quelli che trovi qui: \nhttps://www.cardmarket.com/en/Magic/Account/API \n")
		alert("Rikkio!")
		return
	}
	const client = new MkmApiClient(apikey, apisec);
	client.setAccessTokens(accesskey, accesssec)

	// Params
	let minq = document.getElementById('minquality').value
	let minsr = document.getElementById('minselrate').value
	let lang = document.getElementById('lang').value
	let deck_txt = document.getElementsByTagName('textarea')[0].value
	let deck_list = {}
	deck_txt.split('\n').forEach((v, i, s) => {
		v = v.trim()
		if (v.length > 0)
			deck_list[v.substr(v.indexOf(' ')).trim()] = v.split(' ')[0]
	})

	// Start
	document.getElementsByTagName('button')[0].disabled = true
	document.getElementsByTagName('button')[0].innerText = "... 0% ..."
	let vendors = {}
	let articles = {}
	let products = {}
	let progress = 0
	for (let k of Object.keys(deck_list)) {
		articles[k] = []
		products[k] = []
		// Find cards
		let res = await client.get('/ws/v2.0/products/find', {search:k,  exact:'true', idGame: "1",idLanguage: "1"})
		let text = await res.text();

		const parser = new DOMParser();
		let xml
		try {
			xml = parser.parseFromString(text, "text/xml");
			let xml_products = xml.getElementsByTagName('response')[0].getElementsByTagName('product')

			for (let i=0; i<xml_products.length; i++) {
				let p = xml_products[i]
				let row = []
				row.push(p.getElementsByTagName('idProduct')[0].textContent)
				row.push(p.getElementsByTagName('enName')[0].textContent)
				row.push(p.getElementsByTagName('expansionName')[0].textContent)
				row.push(p.getElementsByTagName('countArticles')[0].textContent)
				products[k].push(row)
			}
		} catch(e) {
			console.error(e)
		}
		for (let product of products[k]) {
			// Find articles
			res = await client.get(`/ws/v2.0/articles/${product[0]}`, {idProduct: product[0],
				minCondition: minq,
				minUserScore: minsr,
				minAvailable: deck_list[k],
				start: '0',
				maxResults: '1000'})
			text = await res.text();
			if (res.status === 204) // no content
				continue

			let sum = 0.0
			let xml_art
			try {
				xml = parser.parseFromString(text, "text/xml");
				xml_art = xml.getElementsByTagName('response')[0].getElementsByTagName('article')
				for (let i=0; i<xml_art.length; i++) {
					let art = xml_art[i]
					let row = []
					row.push(art.getElementsByTagName('idArticle')[0].textContent)
					row.push(art.getElementsByTagName('language')[0].getElementsByTagName("languageName")[0].textContent)
					row.push(art.getElementsByTagName('price')[0].textContent)
					row.push(art.getElementsByTagName('count')[0].textContent)
					row.push(art.getElementsByTagName('condition')[0] ? art.getElementsByTagName('condition')[0].textContent : 'PP')
					row.push(art.getElementsByTagName('seller')[0].getElementsByTagName("idUser")[0].textContent)
					row.push(art.getElementsByTagName('seller')[0].getElementsByTagName("shipsFast")[0].textContent)
					row.push(product[0])
					row.push(k)
					if (lang.length !== 0 && lang !== row[1])
						continue
					// Populate article and vendors lists
					let id_sel = row[5]
					let current_val = parseFloat(row[2])
					sum += current_val
					articles[k].push(row)
					if(!vendors[id_sel])
						vendors[id_sel] = [row]
					else {
						let last = vendors[id_sel][vendors[id_sel].length-1]
						if (last[8] != k) {
							vendors[id_sel].push(row)
						} else {
							if (last[2] > current_val) {
								vendors[id_sel].pop()
								vendors[id_sel].push(row)
							}
						}
					}
				}
			} catch(e) {
				console.log(text)
				console.error(e)
			}
			product.push(sum / xml_art.length)
		}
		progress += 100.0 / Object.keys(deck_list).length
		document.getElementsByTagName('button')[0].innerText = `... ${progress.toFixed(2)}% ...`
	}
	document.getElementsByTagName('button')[0].disabled = false
	document.getElementsByTagName('button')[0].innerText = `START`

	// Sort articles
	for (let k of Object.keys(articles)) {
		articles[k].sort((a, b) => a[2] - b[2])
	}

	// Sort vendors
	let id_vendors = Object.keys(vendors)
	let vendors_sorted_num = Array.prototype.slice.call(id_vendors).sort((a, b) => {
		return vendors[b].length - vendors[a].length
	})
	let vendors_sorted_avg = Array.prototype.slice.call(id_vendors).sort((a, b) => {
		let cum_a = 0
		for (let card of vendors[a]) {
			cum_a += card[2] / products[card[8]].find((v) => v[0] === card[7])[4]
		}
		let cum_b = 0
		for (let card of vendors[b]) {
			cum_b += card[2] / products[card[8]].find((v) => v[0] === card[7])[4]
		}
		return cum_a - cum_b
	})

	// Cost fn
	function cost(s) {
		let acc = 0.0
		let vendors = []
		for (let i of Object.keys(s)) {
			let c = s[i]
			if (!s[i])
				continue
			if (!vendors[c[5]])
				vendors[c[5]] = 0

			vendors[c[5]] += c[2]*deck_list[c[8]]
		}
		vendors.forEach((v) => {
			acc += v + (v >= 50 ? 10 : v >= 25 ? 5 : 2.5)
		})
		return acc
	}
	// Init state
	let state = []
	for (let k of Object.keys(deck_list)) {
		state[k] = articles[k][0]
	}
	console.log(JSON.stringify(articles))
	console.log(JSON.stringify(vendors))

	/*
	for (let i = 0; i<10; i++)
		console.log(cost(vendors[vendors_sorted_num[i]]))
	*/
	//console.log(state, cost(state))
}
