import hashlib
import fcntl
import json
import os
import pathlib
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

CANDIDATE = pathlib.Path('/Users/mustafaelsayed/.codex/worktrees/effect-specialized-recovery/relkit')
DEMO = pathlib.Path('/Users/mustafaelsayed/Workspace/relkit-regression-demo')
CHANGE = pathlib.Path('/Users/mustafaelsayed/Workspace/relkit/openspec/changes/effect-specialized-packages')
STATE = pathlib.Path('/tmp/relkit-effect-specialized-completion-state.json')
INPUTS = ['src', 'tests', 'package.json', 'bun.lock', 'relkit.config.ts', 'tsconfig.json']

def digest(root):
    result = hashlib.sha256()
    for item in INPUTS:
        path = root / item
        files = sorted(path.rglob('*')) if path.is_dir() else [path]
        for file in files:
            if file.is_file():
                result.update(str(file.relative_to(root)).encode())
                result.update(file.read_bytes())
    return result.hexdigest()

def original_links():
    old = json.loads((CHANGE / 'demo-link-restoration.json').read_text())
    result = {}
    for name in old['globals']:
        path = pathlib.Path.home() / '.bun/install/global/node_modules' / name
        if path.is_symlink():
            result[str(path)] = os.readlink(path)
    for root in [DEMO, DEMO / 'evidence/ai-validation-2026-10-03/agent-starter']:
        for path in (root / 'node_modules/@relkit').iterdir():
            if path.is_symlink():
                result[str(path)] = os.readlink(path)
    return result

def prepare_links(source, target, package_map):
    modules = target / 'node_modules'
    modules.mkdir()
    for entry in (source / 'node_modules').iterdir():
        if entry.name in ['@relkit', '.bin']:
            continue
        (modules / entry.name).symlink_to(entry.resolve())
    (modules / '@relkit').mkdir()
    links = {}
    for entry in (source / 'node_modules/@relkit').iterdir():
        name = '@relkit/' + entry.name
        selected = package_map[name]
        (modules / '@relkit' / entry.name).symlink_to(selected)
        links[name] = str(selected)
    (modules / '.bin').mkdir()
    for entry in (source / 'node_modules/.bin').iterdir():
        selected = CANDIDATE / 'packages/cli/dist/index.js' if entry.name == 'relkit' else entry.resolve()
        (modules / '.bin' / entry.name).symlink_to(selected)
    return links

def save(state):
    STATE.write_text(json.dumps(state, indent=2) + '\n')
    (pathlib.Path(state['evidence']) / 'provenance.json').write_text(json.dumps(state, indent=2) + '\n')

if sys.argv[1] == 'init':
    if STATE.exists():
        raise RuntimeError('Task state already exists; inspect before reusing')
    for port in [3000, 3210, 3330, 3331]:
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', port)) == 0:
                raise RuntimeError('Required port already owned: ' + str(port))
    evidence = CHANGE / ('completion-2026-10-05-' + str(int(time.time())))
    evidence.mkdir()
    owned = pathlib.Path(tempfile.mkdtemp(prefix='relkit-effect-specialized-completion-'))
    copy = owned / 'demo'
    shutil.copytree(DEMO, copy, ignore=shutil.ignore_patterns('.git', '.relkit', 'node_modules', 'evidence', '.env', '.turbo'))
    fixture_source = DEMO / 'evidence/ai-validation-2026-10-03/agent-starter'
    fixture = copy / 'evidence/ai-validation-2026-10-03/agent-starter'
    shutil.copytree(fixture_source, fixture, ignore=shutil.ignore_patterns('.git', '.relkit', 'node_modules', '.env', '.turbo'))
    package_map = {}
    for base in [CANDIDATE / 'packages', CANDIDATE / 'integrations/packages']:
        for package in base.glob('*/package.json'):
            package_map[json.loads(package.read_text())['name']] = package.parent
    state = {'candidate': str(CANDIDATE), 'ownedRoot': str(owned), 'evidence': str(evidence), 'originalLinks': original_links(), 'projects': {}, 'processes': [], 'commands': []}
    for name, source, target, ports in [('demo', DEMO, copy, [3000, 3210]), ('fixture', fixture_source, fixture, [3330, 3331])]:
        links = prepare_links(source, target, package_map)
        state['projects'][name] = {'source': str(source), 'root': str(target), 'sourceHash': digest(source), 'copyHash': digest(target), 'ports': ports, 'links': links}
        assert state['projects'][name]['sourceHash'] == state['projects'][name]['copyHash']
    save(state)
    print(json.dumps({'state': str(STATE), 'evidence': str(evidence), 'projects': {key: value['root'] for key, value in state['projects'].items()}, 'originalLinks': len(state['originalLinks'])}))
elif sys.argv[1] == 'start':
    state = json.loads(STATE.read_text())
    for name in (sys.argv[2:] or ['demo', 'fixture']):
        project = state['projects'][name]
        count = sum(process['name'] == name for process in state['processes'])
        log = pathlib.Path(state['evidence']) / (name + '-runtime-' + str(count + 1) + '.log')
        environment = dict(os.environ)
        for key in ['OPENAI_API_KEY', 'RELKIT_ALLOWED_ORIGINS']:
            environment.pop(key, None)
        command = ['rtk', 'bun', str(CANDIDATE / 'packages/cli/dist/index.js'), 'dev', '--project-root', project['root'], '--port', str(project['ports'][0]), '--inspector-port', str(project['ports'][1]), '--no-color']
        with log.open('w') as output:
            child = subprocess.Popen(command, cwd=project['root'], env=environment, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        state['processes'].append({'name': name, 'pid': child.pid, 'command': command, 'log': str(log)})
    save(state)
    print(json.dumps(state['processes']))
elif sys.argv[1] == 'health':
    state = json.loads(STATE.read_text())
    name = sys.argv[2]
    project = state['projects'][name]
    base = 'http://127.0.0.1:' + str(project['ports'][0])
    output = {}
    for path in ['health/ready', 'client/identity', 'graph']:
        with urllib.request.urlopen(base + '/_relkit/v1/' + path, timeout=5) as response:
            body = json.load(response)
        if path == 'graph':
            body = {key: body[key] for key in ['generationId', 'graphHash']}
        output[path] = body
    output['sourceCopyStillIdentical'] = digest(pathlib.Path(project['source'])) == project['sourceHash'] == digest(pathlib.Path(project['root']))
    output['candidateLinksVerified'] = all((pathlib.Path(project['root']) / 'node_modules' / name).resolve() == pathlib.Path(target).resolve() for name, target in project['links'].items())
    (pathlib.Path(state['evidence']) / (name + '-health.json')).write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps(output))
elif sys.argv[1] == 'capture-links':
    state = json.loads(STATE.read_text())
    for path, target in original_links().items():
        state['originalLinks'].setdefault(path, target)
    for root in [pathlib.Path.home() / '.bun/install/global/node_modules', DEMO / 'node_modules', DEMO / 'evidence/ai-validation-2026-10-03/agent-starter/node_modules']:
        for relative in ['langchain', '@langchain/openai', '.bin/relkit']:
            path = root / relative
            if path.is_symlink():
                state['originalLinks'].setdefault(str(path), os.readlink(path))
    save(state)
    print(json.dumps({'originalLinks': len(state['originalLinks'])}))
elif sys.argv[1] == 'record-static':
    state = json.loads(STATE.read_text())
    observed = [('demo', 'check', 136.37), ('fixture', 'check', 107.66), ('demo', 'typecheck', 40.43), ('fixture', 'typecheck', 45.39), ('demo', 'test', 6.08), ('fixture', 'test', 5.04)]
    for name, task, seconds in observed:
        label = name + '-' + ('tests' if task == 'test' else task)
        entry = {'project': name, 'label': label, 'command': ['rtk', 'bun', 'run', task], 'exitCode': 0, 'seconds': seconds, 'log': str(pathlib.Path(state['evidence']) / (label + '.log'))}
        state['commands'] = [item for item in state['commands'] if item['label'] != label]
        state['commands'].append(entry)
        (pathlib.Path(state['evidence']) / (label + '.result.json')).write_text(json.dumps(entry, indent=2) + '\n')
    save(state)
    print('Recorded six observed successful static command results')
elif sys.argv[1] == 'run':
    state = json.loads(STATE.read_text())
    name, label = sys.argv[2:4]
    project = state['projects'][name]
    log = pathlib.Path(state['evidence']) / (label + '.log')
    command = ['rtk', *sys.argv[4:]]
    environment = dict(os.environ)
    for key in ['OPENAI_API_KEY', 'RELKIT_ALLOWED_ORIGINS']:
        environment.pop(key, None)
    subdir = pathlib.Path(state['evidence']) / label
    subdir.mkdir(exist_ok=True)
    environment['RELKIT_AI_EVIDENCE_DIR'] = str(subdir)
    environment['RELKIT_AI_VALIDATION_URL'] = 'http://127.0.0.1:3330'
    environment['RELKIT_ORIGIN_PROBE_URL'] = 'http://127.0.0.1:' + str(project['ports'][0])
    started = time.monotonic()
    with log.open('w') as output:
        result = subprocess.run(command, cwd=project['root'], env=environment, stdout=output, stderr=subprocess.STDOUT, timeout=300)
    entry = {'project': name, 'label': label, 'command': command, 'exitCode': result.returncode, 'seconds': round(time.monotonic() - started, 2), 'log': str(log)}
    with pathlib.Path(str(STATE) + '.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = json.loads(STATE.read_text())
        state['commands'].append(entry)
        save(state)
    (pathlib.Path(state['evidence']) / (label + '.result.json')).write_text(json.dumps(entry, indent=2) + '\n')
    print(json.dumps(entry))
    sys.exit(result.returncode)
elif sys.argv[1] == 'restore-links':
    state = json.loads(STATE.read_text())
    changed = []
    for entry, target in state['originalLinks'].items():
        path = pathlib.Path(entry)
        if not path.is_symlink():
            raise RuntimeError('Original dependency link is no longer a symlink: ' + entry)
        if os.readlink(path) != target:
            changed.append(entry)
            path.unlink()
            path.symlink_to(target)
    state['restoredLinks'] = changed
    state['linksVerified'] = all(pathlib.Path(path).is_symlink() and os.readlink(path) == target for path, target in state['originalLinks'].items())
    save(state)
    print(json.dumps({'restored': len(changed), 'verified': state['linksVerified']}))
elif sys.argv[1] == 'stop':
    state = json.loads(STATE.read_text())
    for process in state['processes']:
        if len(sys.argv) > 2 and process['name'] != sys.argv[2]:
            continue
        try:
            os.killpg(process['pid'], signal.SIGTERM)
        except ProcessLookupError:
            pass
    print('Sent SIGTERM to task-owned process groups')
