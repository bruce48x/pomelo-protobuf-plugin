import * as fs from 'fs';
import * as path from 'path';
import * as Logger from 'pinus-logger';
const logger = Logger.getLogger('ragdoll', __filename);
import { Root, loadSync } from 'protobufjs';
import { Application, IComponent } from 'pinus';

const SERVER = 'server';
const CLIENT = 'client';

export interface ProtobufOptions {
    serverProtos?: string;
    clientProtos?: string;
}

export class ProtobufComponent implements IComponent {
    app: Application;
    version: number;
    watchers: { [type: string]: any };
    serverProtosPath: string;
    clientProtosPath: string;
    serverProtoRoot: Root;
    clientProtoRoot: Root;
    serverProtos: any;
    clientProtos: any;
    name = '__decodeIO__protobuf__';

    constructor(app: Application, opts: ProtobufOptions) {
        this.app = app;
        this.version = 0;
        this.watchers = {};
        opts = opts || {};
        this.serverProtosPath =
            opts.serverProtos || '/config/serverProtos.json';
        this.clientProtosPath =
            opts.clientProtos || '/config/clientProtos.json';
    }

    start(cb: () => void): void {
        this.setProtos(
            SERVER,
            path.join(this.app.getBase(), this.serverProtosPath),
        );
        this.setProtos(
            CLIENT,
            path.join(this.app.getBase(), this.clientProtosPath),
        );

        this.serverProtoRoot = Root.fromJSON(this.serverProtos);
        this.clientProtoRoot = Root.fromJSON(this.clientProtos);

        process.nextTick(cb);
    }

    normalizeRoute(route: string): string {
        return route.split('.').join('');
    }

    check(type: 'server' | 'client', route: string): any {
        route = this.normalizeRoute(route);
        switch (type) {
            case SERVER:
                if (!this.serverProtoRoot) {
                    return null;
                }
                return this.serverProtoRoot.lookup(route);
                break;
            case CLIENT:
                if (!this.clientProtoRoot) {
                    return null;
                }
                return this.clientProtoRoot.lookup(route);
                break;
            default:
                throw new Error(
                    'decodeIO meet with error type of protos, type: ' +
                        type +
                        ' route: ' +
                        route,
                );
                break;
        }
    }

    encode(route: string, message: any): Uint8Array {
        route = this.normalizeRoute(route);
        const ProtoMessage = this.serverProtoRoot.lookupType(route);
        if (!ProtoMessage) {
            throw Error('not such route ' + route);
        }
        const errMsg = ProtoMessage.verify(message);
        if (errMsg) {
            throw Error(errMsg);
        }
        const msg = ProtoMessage.create(message);
        return ProtoMessage.encode(msg).finish();
    }

    decode(route: string, message: Buffer): { [key: string]: any } {
        route = this.normalizeRoute(route);
        const ProtoMessage = this.clientProtoRoot.lookupType(route);
        if (!ProtoMessage) {
            throw Error('not such route ' + route);
        }
        const msg = ProtoMessage.decode(message);
        return ProtoMessage.toObject(msg);
    }

    getProtos() {
        return {
            server: this.serverProtos,
            client: this.clientProtos,
            version: this.version,
        };
    }

    getVersion(): number {
        return this.version;
    }

    setProtos(type: 'server' | 'client', path: string): void {
        if (!fs.existsSync(path)) {
            return;
        }

        if (type === SERVER) {
            this.serverProtos = require(path);
        }

        if (type === CLIENT) {
            this.clientProtos = require(path);
        }

        //Set version to modify time
        const time = fs.statSync(path).mtime.getTime();
        if (this.version < time) {
            this.version = time;
        }

        //Watch file
        const watcher = fs.watch(path, this.onUpdate.bind(this, type, path));
        if (this.watchers[type]) {
            this.watchers[type].close();
        }
        this.watchers[type] = watcher;
    }

    onUpdate(type: 'server' | 'client', path: string, event: string): void {
        if (event !== 'change') {
            return;
        }

        fs.readFile(path, 'utf8', function (err, data) {
            try {
                if (type === SERVER) {
                    this.serverProtos = JSON.parse(data);
                } else {
                    this.clientProtos = JSON.parse(data);
                }

                this.version = fs.statSync(path).mtime.getTime();
            } catch (e) {
                console.debug(e.stack);
            }
        });
    }

    stop(force: boolean, cb: () => void): void {
        for (const type in this.watchers) {
            this.watchers[type].close();
        }
        this.watchers = {};
        process.nextTick(cb);
    }
}
