import sys

import uvicorn

from ahmatta.main import create_app

app = create_app(database_url=f"sqlite:///{sys.argv[1]}")
uvicorn.run(app, host="127.0.0.1", port=18742, log_level="info")
