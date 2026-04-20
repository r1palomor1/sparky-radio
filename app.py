import os
import json
import random
import requests
from fastapi import FastAPI, Header, HTTPException

app = FastAPI()

# Access key defaults to Elite-Radio-V1 if not set in environment
ACCESS_KEY = os.environ.get("HF_ADMIN_KEY", "Elite-Radio-V1")

# Best Practice: Diverse mirror list for failover redundancy
MIRRORS = [
    "de1.api.radio-browser.info",
    "at1.api.radio-browser.info",
    "nl1.api.radio-browser.info"
]

@app.get("/")
def read_root():
    return {"status": "Elite Relay Active (v2.2)"}

@app.get("/search")
def search_stations(name: str = "", tag: str = "", country: str = "", x_api_key: str = Header(None)):
    # 1. Access Control
    if x_api_key != ACCESS_KEY:
        print("!!! UNAUTHORIZED ACCESS ATTEMPT !!!")
        raise HTTPException(status_code=403, detail="Unauthorized")

    # 2. Modern Failover Search logic
    random.shuffle(MIRRORS)
    
    # Modern Search Params (150 stations for Heuristic Curation)
    params = {
        "limit": 150,
        "order": "clickcount", # Priority on live activity
        "reverse": "true",
        "hidebroken": "true",  # UX: No offline streams
        "ssl_error": "false"   # UX: No certificate failures
    }
    if name: params["name"] = name
    if tag: params["tag"] = tag
    if country: params["countrycode"] = country 

    headers = {
        "User-Agent": "EliteRadioRelay/2.2 (Gateway; HeuristicCuration)",
        "Accept": "application/json"
    }

    # Failover loop: cycle through mirrors until success
    data = None
    for mirror in MIRRORS:
        try:
            rb_url = f"https://{mirror}/json/stations/search"
            print(f"---> ATTEMPTING MIRROR: {rb_url}")
            response = requests.get(rb_url, params=params, headers=headers, timeout=8)
            response.raise_for_status()
            data = response.json()
            break 
        except Exception as e:
            print(f"!!! MIRROR {mirror} FAILED: {str(e)}")
            continue

    if data is None: return []

    # 3. ELITE SLIM LOGIC: Map to telemetry-rich keys
    slim_data = []
    for item in data:
        # v: Votes, cc: Clicks, ct: Trend, f: Favicon
        slim_data.append({
            "n":  item.get("name", "Unknown")[:60],    
            "u":  item.get("url_resolved", item.get("url", "")),         
            "t":  item.get("tags", "").split(',')[0][:20], 
            "r":  item.get("countrycode", "--")[:5],      
            "c":  item.get("codec", "MP3")[:10],
            "id": item.get("stationuuid", "")[:36],
            "v":  item.get("votes", 0),
            "cc": item.get("clickcount", 0),
            "ct": item.get("clicktrend", 0),
            "f":  item.get("favicon", "")
        })
    
    print(f"DEBUG: Returning {len(slim_data)} high-fidelity stations")
    return slim_data
