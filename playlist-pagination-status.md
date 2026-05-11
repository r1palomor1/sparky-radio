# Playlist Pagination Infinite Loop Status

## Issue Summary
We are attempting to fetch paginated results for YouTube playlists using `youtubei.js`. 
Currently, the first page fetches successfully and provides a valid `continuation` token. However, when the frontend makes a subsequent request to `/api/fetchPlaylist?continuation=...` for page 2+, the API returns `0` video/playlist results, but *still returns a new continuation token*. 

Because a token is returned, the frontend's infinite scroll logic thinks there are more pages available, resulting in a continuous loop of fetching empty pages:
```text
[YT] Infinite scroll trigger: fetching next page for playlists
[YT-FETCH] Fetching URL: /api/fetchPlaylist?continuation=...
[YT-FETCH] Response received: 200 
[YT-FETCH] Data received. Video results: 0
```

## What We've Tried
1. **Initial Method (Chips Bypass):** We updated `api/fetchPlaylist.js` to use `youtube.search().memo.get("ContinuationItem")` which successfully bypassed the "chips" issue to get the token for the first page.
2. **Standard Parsing on Continuation:** For `continuation` fetching, we used `youtube.actions.execute('/search', { continuation })`. Standard array traversal (`response.data.onResponseReceivedCommands[...`) failed because the JSON tree varies significantly.
3. **Deep Find Traversal:** We implemented a recursive deep-find strategy (`findPlaylistRenderers`) to search the entire raw JSON tree for `playlistRenderer` objects. This still resulted in `0` results. This indicates the `playlistRenderer` objects are either entirely absent from the continuation response or structured under a different key than expected.

## Technical Details
- **Branch:** `feature/yt-pagination`
- **Target File:** `api/fetchPlaylist.js`
- **Current Behavior:** `findPlaylistRenderers` successfully avoids crashes but yields `0` playlists in the `action.execute('/search')` payload, yet a `continuation` is still extracted and passed back.
- **Constraints Checked:** Did not touch video fetching, radio functionality, or irrelevant UI.

## Next Steps for Tomorrow
1. **Raw Payload Inspection:** We need to log and carefully examine the exact raw JSON output of `youtube.actions.execute('/search', { continuation })` on a *playlist* continuation.
2. **Object Schema:** Determine if page 2 returns `playlistRenderer`, `compactPlaylistRenderer`, `gridPlaylistRenderer`, or if items are hidden inside `appendContinuationItemsAction`.
3. **API Logic Verification:** Confirm if `/search` is the correct action to hit with this continuation token, as doing so currently returns 0 valid objects.
4. **TODO - Video Pagination Review:** Review the video side pagination (`api/searchVideos.js`) to make sure it is optimized. It is currently working, but having another set of eyes investigate for optimizations won't hurt.
5. **TODO - Enhance Metadata:** Update `api/searchVideos.js` and `api/fetchPlaylist.js` to extract `views` (or `short_view_count`) and `published` (timeframe) data instead of just the channel name and duration. Pass these down to update the UI cards.
