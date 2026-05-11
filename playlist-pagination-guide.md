# YouTube Playlist Pagination Guide

This guide explains how to properly handle pagination (infinite scroll) for YouTube **Playlist** searches using the `youtubei.js` library, specifically addressing the issues where the standard `getContinuation()` methods fail.

## 1. The Challenge: "Chips" vs. "Infinite Scroll"
When you search for playlists using `youtube.search(query, { type: 'playlist' })`, YouTube's API returns a "Chip Cloud" at the top of the response (buttons like *All*, *Shorts*, *Watched*). 

Because these chips contain their own `continuationCommand` tokens, the standard `youtubei.js` parsing gets confused. Standard property access like `results.continuation` often returns `undefined` or a useless chip token.

## 2. Extracting the Correct Playlist Continuation Token
To get the actual token meant for **loading more search results** (infinite scrolling), you must retrieve it from the internal `memo` map where `youtubei.js` stores `ContinuationItem` nodes.

```javascript
// 1. Initial Search
const results = await youtube.search(query, { type: 'playlist' });

// 2. Extract the infinite-scroll token
let nextPageToken = null;
const contItems = results.memo.get("ContinuationItem");

if (contItems && contItems.length > 0) {
    // The first ContinuationItem in the memo is typically the bottom-of-page scroll trigger
    nextPageToken = contItems[0].endpoint?.payload?.token;
}
```

## 3. Fetching "Page 2" (and beyond)
Because we bypassed the standard parser to get the token, we must also bypass the standard `getContinuation()` method to fetch the next page. We do this by calling the internal `actions.execute()` method directly.

```javascript
// 3. Make the raw API call using the extracted token
const response = await youtube.actions.execute('/search', {
    continuation: nextPageToken,
    client: youtube.session.context.client.clientName // Ensures proper auth/formatting
});
```

## 4. Parsing the Next Page Response
The response from `actions.execute` is the raw inner JSON from YouTube. The new playlist objects will be deeply nested inside `onResponseReceivedCommands`.

Here is how you extract the raw items from that response:

```javascript
// 4. Navigate the raw JSON tree to find the new items array
const parsedData = response.data;
let newItems = [];

try {
    newItems = parsedData.onResponseReceivedCommands[0]
                .appendContinuationItemsAction
                .continuationItems;
} catch (e) {
    console.error("Failed to parse continuation items tree:", e);
}
```

*Note: The items in this `newItems` array are raw YouTube node objects (e.g., `playlistRenderer`). You will need to map over them to extract the `playlistId`, `title`, and `thumbnails` using standard deep-object safe parsing (e.g., `item.playlistRenderer.playlistId`).*

## 5. Fetching the Token for "Page 3"
Inside the `newItems` array returned from Page 2, the **last item** in the array is usually another `ContinuationItem`. You extract the token for the *next* page from that exact item.

```javascript
let page3Token = null;

// The continuation trigger is always appended to the end of the new items
const lastItem = newItems[newItems.length - 1];

if (lastItem && lastItem.continuationItemRenderer) {
    page3Token = lastItem.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
}
```

## Summary Workflow for `fetchPlaylist.js`
When updating your API, your logic should look like this:

1. **If `req.query.query` is present:**
   * Run `youtube.search()`.
   * Extract `results.results` (the playlists).
   * Extract `nextPageToken` from `results.memo.get("ContinuationItem")`.
   * Return formatted playlists + `nextPageToken`.

2. **If `req.query.continuation` is present:**
   * Run `youtube.actions.execute('/search', { continuation: req.query.continuation, ... })`.
   * Extract the new raw items from `onResponseReceivedCommands`.
   * Format those raw items.
   * Extract the *next* continuation token from the last item in the array (`continuationItemRenderer`).
   * Return newly formatted playlists + the *new* token.
