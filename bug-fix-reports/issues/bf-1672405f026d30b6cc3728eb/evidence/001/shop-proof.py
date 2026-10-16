"""Read-only checks of the actual shop, private auth state and persisted order."""
import json
import pathlib
import sqlite3
import sys
import urllib.request

app = pathlib.Path("/Users/mustafaelsayed/Workspace/typescripts/relkit-ecommerce-lab")
out = pathlib.Path(sys.argv[1])
cookie = json.loads((app / ".auth-state.json").read_text())["cookie"]


def get(path, authenticated=False):
    request = urllib.request.Request("http://127.0.0.1:3400" + path, headers={"cookie": cookie} if authenticated else {})
    with urllib.request.urlopen(request, timeout=5) as response:
        assert response.status == 200
        return json.load(response)


catalog = get("/products")
assert catalog["revision"] == "v1:base"
assert len(catalog["products"]) == 3
assert next(row for row in catalog["products"] if row["id"] == "notebook")["priceCents"] == 1250
assert get("/api/auth/get-session", True)["user"]
cart = get("/cart", True)
assert cart["totalCents"] == 7200 and len(cart["items"]) == 1
order_id = json.loads((app / "evidence/persistence.json").read_text())["orderId"]
assert get("/orders/" + order_id, True)["totalCents"] == 4900
with sqlite3.connect(f"file:{app}/.relkit/state/commerce.sqlite?mode=ro", uri=True) as db:
    assert db.execute("SELECT totalCents FROM orders WHERE id = ?", (order_id,)).fetchone()[0] == 4900
for url in ["http://127.0.0.1:3400/", "http://127.0.0.1:3410/", "http://127.0.0.1:3400/_relkit/v1/api-reference"]:
    with urllib.request.urlopen(url, timeout=5) as response:
        assert response.status == 200
result = {"status": "passed", "products": 3, "revision": "v1:base", "authenticated": True, "cartTotalCents": 7200, "historicalOrderTotalCents": 4900, "independentSqliteReadBack": True, "links": 3}
out.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
