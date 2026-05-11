import fs from 'fs';
import { Innertube } from 'youtubei.js';

(async () => {
    const yt = await Innertube.create();
    const searchResults = await yt.search("bad bunny", { type: 'playlist' });
    const rawTokens = [];
    
    function findAllTokens(obj, path='') {
        if (!obj || typeof obj !== 'object') return;
        if (obj.continuationEndpoint?.continuationCommand?.token) {
           rawTokens.push({path, token: obj.continuationEndpoint.continuationCommand.token});
        }
        if (obj.payload?.token) {
           rawTokens.push({path, token: obj.payload.token});
        }
        for (const key in obj) {
            findAllTokens(obj[key], path ? path+'.'+key : key);
        }
    }
    
    findAllTokens(searchResults.page);
    fs.writeFileSync('scratch/all_tokens.json', JSON.stringify(rawTokens, null, 2));
    console.log("Tokens saved to scratch/all_tokens.json");
})();