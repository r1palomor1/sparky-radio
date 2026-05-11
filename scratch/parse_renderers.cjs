const fs = require('fs');

const rawStr = fs.readFileSync('scratch/raw_page2_response.json', 'utf8');
const raw = JSON.parse(rawStr);

console.log("Response commands keys:", Object.keys(raw));

const commands = raw.on_response_received_commands || raw.onResponseReceivedCommands;

let newItems = [];
if (commands) {
    console.log("Commands length:", commands.length);
    commands.forEach((c, idx) => {
        console.log(`Cmd ${idx} type:`, c.type || c.appendContinuationItemsAction ? 'appendContinuationItemsAction' : Object.keys(c));
        
        let items = c.appendContinuationItemsAction?.continuationItems || 
                    c.contents || 
                    c.continuationItems;
                    
        if (items) {
           console.log(`Found ${items.length} items`);
           newItems = items;
           
           items.forEach((item, i) => {
               if (i===0) console.log("Sample item keys:", Object.keys(item));
               if (item.itemSectionRenderer) {
                   console.log("itemSectionRenderer internal keys:", Object.keys(item.itemSectionRenderer));
                   if(item.itemSectionRenderer.contents) {
                       console.log("itemSectionRenderer.contents[0] keys:", Object.keys(item.itemSectionRenderer.contents[0]));
                   }
               }
           });
        }
    });
} else {
    console.log("No commands found in tree");
}
