import pathlib
import subprocess
import time

images = {
    "redis7": "redis:7-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf",
    "inngest": "inngest/inngest@sha256:d5365a31f8bf504dc2d54ddd114fcdc1a0413f8b57a450365c095ab6234ad8c2",
    "bun": "oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e",
}
for name, image in images.items():
    print("Pulling pinned " + name, flush=True)
    started = time.monotonic()
    with pathlib.Path('/tmp/relkit-effect-specialized-warm-' + name + '.log').open('w') as output:
        subprocess.run(['rtk', 'docker', 'pull', image], stdout=output, stderr=subprocess.STDOUT, timeout=300, check=True)
    print(name + ' ready after ' + str(round(time.monotonic() - started, 1)) + 's', flush=True)
