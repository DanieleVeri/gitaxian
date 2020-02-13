/********************************************************************************** Main */
function ship(price) {
	return price >= 50 ? 10 : price >= 25 ? 5 : 2.5
}

function cost(article_list, deck_list) {
	let articles_val = 0.0
	let ship_val = 0
	let vendors = []
	for (let i of Object.keys(article_list)) {
		let c = article_list[i]
		if (!article_list[i])
			continue
		if (!vendors[c[5]])
			vendors[c[5]] = 0

		vendors[c[5]] += c[2]*deck_list[c[8]]
	}
	vendors.forEach((v) => {
		ship_val += ship(v)
		articles_val += v
	})
	return [articles_val, ship_val]
}

async function main() {
	// MKM API
	let apikey = document.getElementById('apikey').value
	let apisec = document.getElementById('apisec').value
	let accesskey = document.getElementById('accesskey').value
	let accesssec = document.getElementById('accesssec').value
	if (apikey.length * apisec.length * accesskey.length * accesssec.length === 0) {
		alert("Missing on or more API keys: \nhttps://www.cardmarket.com/en/Magic/Account/API \n")
		return
	}
	const client = new MkmApiClient(apikey, apisec);
	client.setAccessTokens(accesskey, accesssec)
	//client.setDebug(false)

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

	// Start retrieving articles
	document.getElementsByTagName('button')[0].disabled = true
	document.getElementsByTagName('button')[0].innerText = "requests: 0% ..."
	let vendors = {}
	let articles = {}
	let products = {}
	let progress = 0
	for (let k of Object.keys(deck_list)) {
		articles[k] = []
		products[k] = []
		// Find products (all editions for each card)
		let res = await client.request('GET', '/ws/v2.0/products/find', {search:k,  exact:'true', idGame: "1",idLanguage: "1"})
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
			// Find articles (all articles for each edition)
			res = await client.request('GET', `/ws/v2.0/articles/${product[0]}`, {idProduct: product[0],
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
				console.error(e)
			}
			product.push(sum / xml_art.length)  // set avg price per product
		}
		progress += 100.0 / Object.keys(deck_list).length
		document.getElementsByTagName('button')[0].innerText = `requests ${progress.toFixed(2)}% ...`
	}

	// Sort articles & vendors
	document.getElementsByTagName('button')[0].innerText = `sorting ...`
	for (let k of Object.keys(articles)) {
		articles[k].sort((a, b) => a[2] - b[2])
	}
	let id_vendors = Object.keys(vendors)
	let vendors_sorted_num = Array.prototype.slice.call(id_vendors).sort((a, b) => {
		return vendors[b].length - vendors[a].length
	})

	// Start search
	document.getElementsByTagName('button')[0].innerText = `searching ...`
	let state = []
	// Naive lowest cost start
	for (let k of Object.keys(deck_list)) {
		state[k] = articles[k][0]
		if (!state[k])
			continue
	}
	let c0 = cost(state, deck_list)

	// Search loop
	let i = 0
	async function next_state() {
		// Exit once passed 25% vendors
		if (i>=vendors_sorted_num.length/4) {
			// Update cart
			let skipped = ''
			let body = '<?xml version="1.0" encoding="UTF-8" ?><request><action>add</action>'
			Object.keys(state).forEach((k) => {
				if (state[k])
					body += `<article><idArticle>${state[k][0]}</idArticle><amount>${deck_list[k]}</amount></article>`
				else
					skipped += `${deck_list[k]} ${k}\n`
			})
			body += '</request>'
			let res = await client.request('PUT', `/ws/v2.0/shoppingcart`, body)
			if (res.status === 200) {
				if (skipped.length === 0)
					alert('All items have been successfully added to your cart')
				else
					alert('Cart updated succesfully.\nThe following items were not found:\n' + skipped)
			} else
				alert('Cart update error')
			document.getElementsByTagName('button')[0].disabled = false
			document.getElementsByTagName('button')[0].innerText = `START`
			return
		}

		// Try next vendor in sorted array
		let vid = vendors_sorted_num[i]
		let copy = Object.assign({}, state)
		vendors[vid].forEach((v) => copy[v[8]] = v)
		let c1 = cost(copy, deck_list)
		if (c0[0]+c0[1] > c1[0]+c1[1]) {
			state=copy
			c0 = c1
		}
		document.getElementsByTagName('button')[0].innerText = `searching ${(i/(vendors_sorted_num.length/4.0)*100.0).toFixed(2)}% ...`
		i++
		setTimeout(next_state, 0)
	}
	setTimeout(next_state, 0) // avoid UI block
}

/************************************* MKM API *************************************/

function MkmApiClient(key, secret) {
	this.debug = true
	this.app_key = key;
	this.app_secret = secret;
}

MkmApiClient.prototype.setDebug = function(value) {
	this.debug = value;
};

MkmApiClient.prototype.request = async function(method, path, data, headers, tokens) {
	let keys = {
		app_key: this.app_key,
		secret: this.app_secret,
		access_token: this.access_token || undefined,
		access_token_secret: this.access_token_secret || undefined
	}
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
	const host= this.debug ? 'sandbox.cardmarket.com' : 'api.cardmarket.com'
	var oauth_header = await this.getOauthHeader(method, path, {
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

	if (method === "GET") {
		var str = [];
		for(var k in data) {
			str.push(k + '=' + _urlencode(data[k]));
		}
		path += '?' + str.join('&')
		return await fetch(`https://${host}${path}`, {
			method: method,
			headers
		})
	}
	else if (method === "POST" || method === "PUT") {
		return await fetch(`https://${host}${path}`, {
			method: method,
			headers,
			body: data ? typeof data === 'string' ? data : JSON.stringify(data) : undefined
		})
	}
};

MkmApiClient.prototype.setAccessTokens = function(access_token, access_token_secret){
	this.access_token = access_token;
	this.access_token_secret = access_token_secret;
};

MkmApiClient.prototype.getOauthHeader = async function (method, path, params, data, keys) {
	var header = `OAuth realm="${this.getUri(path)}",`;
	for(var k in params){
		header += k + '="' + params[k] +'",';
    }

	var signature = await this.getSignature(method, path, params, data, keys);
    header += `oauth_signature="${signature[1]}"`;
	return header;
}

MkmApiClient.prototype.getUri = function (path){
	return 'https://' + (this.debug ? 'sandbox.cardmarket.com' : 'api.cardmarket.com' ) + path.split('?')[0];
}

MkmApiClient.prototype.getSignature = async function (method, path, params, data, keys) {
    var str = this.getFinalString(method, path, params, data);
	var signing_key = _urlencode(keys.secret) + '&' + (keys.access_token_secret ? _urlencode(keys.access_token_secret) : '');
	return [str, await _hmac_sha1(signing_key, str)];
}

MkmApiClient.prototype.getFinalString =  function (method, path, params, data) {
	var uri = this.getUri(path);
	var str = method + '&' + _urlencode(uri) + '&';
    str += _urlencode(_params_string(params, data));
	return str;
}

/******** UTILS ********/

function _arrayBufferToBase64( buffer ) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
}

async function _hmac_sha1(key, text) {
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

function _urlencode(string) {
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

function _params_string(params, data){
	params = _makeParams(params, data);
	var str = [];
	for(var k in params){
		str.push(k + '=' + _urlencode(params[k].toString()));
	}
	const str_params = str.join('&');

	return str_params;
}

function _makeParams(params, data){
	const needed_params = ['consumer_key','token','nonce','timestamp','signature_method','version'];
	if (typeof data !== 'string') {
		for(var k in data){
			params[k] = data[k];
		}
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
