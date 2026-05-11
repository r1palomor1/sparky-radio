import fs from 'fs';
import { Innertube } from 'youtubei.js';

(async () => {
    const yt = await Innertube.create();
    const searchResults = await yt.search("bad bunny", { type: 'playlist' });
    const contItems = searchResults.memo.get("ContinuationItem");
    if (!contItems || contItems.length === 0) return;
    
    const token = contItems[0].endpoint?.payload?.token;
    const response = await yt.actions.execute('/search', { continuation: token, client: yt.session.context.client.clientName });
    
    fs.writeFileSync('scratch/page2_raw.json', JSON.stringify(response.data, null, 2));
    console.log("DONE");
})();