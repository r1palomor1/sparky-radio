import { Innertube } from 'youtubei.js';

async function test() {
    const youtube = await Innertube.create();
    console.log("Searching for playlists...");
    const results = await youtube.search("lofi", { type: 'playlist' });
    
    let nextPageToken = null;
    const contItems = results.memo.get("ContinuationItem");
    if (contItems && contItems.length > 0) {
        nextPageToken = contItems[0].endpoint?.payload?.token;
        console.log("Extracted Token:", nextPageToken);
    } else {
        console.log("NO TOKEN FOUND");
    }

    if (nextPageToken) {
        console.log("Fetching page 2...");
        const response = await youtube.actions.execute('/search', { continuation: nextPageToken, parse: true, client: youtube.session.context.client.clientName });
        
        console.log("Keys in response:", Object.keys(response));
        console.log("on_response_received_commands length:", response.on_response_received_commands?.length);
        
        let cmd = response.on_response_received_commands?.find(c => c.appendContinuationItemsAction || c.type === 'appendContinuationItemsAction');
        let items = cmd?.appendContinuationItemsAction?.continuationItems || cmd?.contents;
        
        if (!items) {
           console.log("Looking directly for continuationItems array on cmd", cmd?.continuationItems?.length);
        }

        if(items) {
           console.log("Found items via appendContinuationItemsAction:", items.length);
        } else {
           console.log("No items found! Printing all commands...");
           response.on_response_received_commands?.forEach((cmd, idx) => {
               console.log(`Cmd ${idx}: ${cmd.type} keys:` , Object.keys(cmd));
               if(cmd.contents) console.log(` Contents: ${cmd.contents.length} items`);
           });
        }
    }
}
test();