const express = require('express')
const commandLineArgs = require('command-line-args')
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express()
app.use(bodyParser.json());

const blueskyMaxCharLength = 300;

const optionDefinitions = [
    { name: 'port', defaultOption: 7969, type: Number },
    { name: 'blueskyidentifier', alias: 'u', type: String },
    { name: 'blueskypass', alias: 'p', type: String }
]

const options = commandLineArgs(optionDefinitions)


const valid =
    options.blueskyidentifier && options.blueskypass;

if (!valid) {
    throw new Exception('Invalid args provided - include --blueskyidentifier x --blueskypass y');
}

const defaultport = 7969

let port = options.port;
if (!port) {
    console.log(`Using default port ${defaultport}`)
    port = defaultport;
}

app.post('/post-published', async (req, res) => {
    console.log('Post received')
    const post = req?.body?.post?.current;
    if (!post || !post.excerpt || !post.url) {
        res.statusCode = 403;
        res.send('Invalid post')
    }
    console.log(post)
    const postText = truncateString(post.excerpt, blueskyMaxCharLength - (post.url.length + 2)) + "\n\n" + post.url;
    const linkFacets = [
        { 
          index: {
            byteStart: new Blob([postText]).size - new Blob([post.url]).size ,
            byteEnd:new Blob([postText]).size
          },
          features: [{
            $type: 'app.bsky.richtext.facet#link',
            uri: post.url
          }]
        }
      ]
    const sessionToken = await createBlueskySession();
    await createRecord(sessionToken, postText, linkFacets)
    res.send('Success!')
})

app.listen(port, () => {
    console.log(`Bluesky integration listening on port ${port}`)
    console.log(`Add this to your Ghost on-published webhook: http://127.0.0.1:${port}`)
})


function truncateString(str, num) {
    return str.length > num ? str.slice(0, num) + '...' : str;
}


const createBlueskySession = async () => {
    try {
        const response = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
            identifier: options.blueskyidentifier,
            password: options.blueskypass
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log(response.data);
        return response.data.accessJwt
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
    }
};


const createRecord = async (token, text, linkFacets) => {
    try {
        const response = await axios.post('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
            collection: 'app.bsky.feed.post',
            repo: options.blueskyidentifier,
            record: {
                text: text,
                createdAt: new Date().toISOString(),
                facets: linkFacets
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        console.log(response.data);
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
    }
};
