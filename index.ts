import { ProtobufComponent } from './lib/components/protobuf';
import { IPlugin } from 'pinus';

export const Protobuf: IPlugin = {
    name: '__decodeIO__protobuf__',
    components: [ProtobufComponent],
};
