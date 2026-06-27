"""
main.py — run the full pipeline: ingest → cluster.
Called by the Node.js backend via POST /ingest/trigger.
"""
import sys
import json
import logging

from ingest import run_ingestion
from cluster import run_clustering

logging.basicConfig(level=logging.INFO, format="[pipeline] %(levelname)s %(message)s")

def main():
    new_articles = run_ingestion()
    num_clusters = run_clustering()
    result = {
        "status": "done",
        "new_articles": new_articles,
        "clusters": num_clusters,
    }
    print(json.dumps(result))
    return result

if __name__ == "__main__":
    main()
