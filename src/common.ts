/*!
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as is from 'is';

export interface ObjectToStructConverterConfig {
    removeCircular?: boolean;
    stringify?: boolean;
}

export function objToStruct(obj: {}, options: ObjectToStructConverterConfig) {
    return new ObjectToStructConverter(options).convert(obj);
}

const _isPlainObjectCache = new WeakMap();

export class ObjectToStructConverter {
    seenObjects: Set<{}>;
    removeCircular: boolean;
    stringify?: boolean;

    /**
     * A class that can be used to convert an object to a struct. Optionally this
     * class can be used to erase/throw on circular references during conversion.
     *
     * @private
     *
     * @param {object=} options - Configuration object.
     * @param {boolean} options.removeCircular - Remove circular references in the
     *     object with a placeholder string. (Default: `false`)
     * @param {boolean} options.stringify - Stringify un-recognized types. (Default:
     *     `false`)
     */
    constructor(options?: ObjectToStructConverterConfig) {
        options = options || {};
        this.seenObjects = new Set();
        this.removeCircular = options.removeCircular === true;
        this.stringify = options.stringify === true;
    }

    /**
     * Begin the conversion process from a JS object to an encoded gRPC Value
     * message.
     *
     * @param {*} obj - The input value.
     * @return {object} - The encoded value.
     *
     * @example
     * ObjectToStructConverter.convert({
     *   aString: 'Hi'
     * });
     * // {
     * //   fields: {
     * //     aString: {
     * //       stringValue: 'Hello!'
     * //     }
     * //   }
     * // }
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    convert(obj: any) {
        const convertedObject = {
            fields: {},
        };
        this.seenObjects.add(obj);
        for (const prop in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                const value = obj[prop];
                if (is.undefined(value)) {
                    continue;
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (convertedObject as any).fields[prop] = this.encodeValue_(value);
            }
        }
        this.seenObjects.delete(obj);
        return convertedObject;
    }

    /**
     * Convert a raw value to a type-denoted protobuf message-friendly object.
     *
     * @private
     *
     * @param {*} value - The input value.
     * @return {*} - The encoded value.
     *
     * @example
     * ObjectToStructConverter.encodeValue('Hi');
     * // {
     * //   stringValue: 'Hello!'
     * // }
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    encodeValue_(value: any): any {

        switch (value) {
            case void 0:
                throw 'Value of type undefined not recognized.';
            case null:
                return {
                    nullValue: 0,
                };
            case true:
            case false:
                return {
                    boolValue: value,
                };
        }

        switch (typeof value) {
            case 'number':
                return {
                    numberValue: value,
                };
            case 'string':
                return {
                    stringValue: value,
                };
            case 'object':
                if (Array.isArray(value)) {
                    return {
                        listValue: {
                            values: (value as Array<{}>).map(this.encodeValue_.bind(this)),
                        },
                    };
                } else if (Buffer.isBuffer(value)) {
                    return {
                        blobValue: value,
                    };
                } else if (isPlainObject(value)) {
                    if (this.seenObjects.has(value!)) {
                        // Circular reference.
                        if (!this.removeCircular) {
                            throw new Error(
                                [
                                    'This object contains a circular reference. To automatically',
                                    'remove it, set the `removeCircular` option to true.',
                                ].join(' ')
                            );
                        }
                        return {
                            stringValue: '[Circular]',
                        };
                    } else {
                        return {
                            structValue: this.convert(value!),
                        };
                    }
                } else {

                    if (!this.stringify) {
                        throw new Error('Value of type ' + typeof value + ' not recognized.');
                    }

                    return {
                        stringValue: String(value),
                    };
                }
        }

    }
}

/**
 *
 * @param mixed {object}
 */
function isPlainObject(mixed: object) {

    if (_isPlainObjectCache.has(mixed))
        return _isPlainObjectCache.get(mixed);

    const proto = Object.getPrototypeOf(mixed);

    switch (proto) {
        case undefined:
        case null:
        case Object.prototype:
            _isPlainObjectCache.set(mixed, true);
            return true;
    }

    if (Object.hasOwnProperty.call(proto, 'constructor')) {

        const constr = proto.constructor;

        if (typeof constr == 'function'
            && constr instanceof constr
            && Object.prototype.toString.call(constr) == '[object Function]') {

            _isPlainObjectCache.set(mixed, true);

            return true;
        }
    }

    _isPlainObjectCache.set(mixed, false);

    return false;

}

/**
 * Condense a protobuf Struct into an object of only its values.
 *
 * @private
 *
 * @param {object} struct - A protobuf Struct message.
 * @return {object} - The simplified object.
 *
 * @example
 * GrpcService.structToObj_({
 *   fields: {
 *     name: {
 *       kind: 'stringValue',
 *       stringValue: 'Stephen'
 *     }
 *   }
 * });
 * // {
 * //   name: 'Stephen'
 * // }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function structToObj(struct: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convertedObject = {} as any;
    for (const prop in struct.fields) {
        // eslint-disable-next-line no-prototype-builtins
        if (struct.fields.hasOwnProperty(prop)) {
            const value = struct.fields[prop];
            convertedObject[prop] = decodeValue(value);
        }
    }

    return convertedObject;
}

/**
 * Decode a protobuf Struct's value.
 *
 * @param {object} value - A Struct's Field message.
 * @return {*} - The decoded value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decodeValue(value: any) {
    switch (value.kind) {
        case 'structValue': {
            return structToObj(value.structValue);
        }

        case 'nullValue': {
            return null;
        }

        case 'listValue': {
            return value.listValue.values.map(decodeValue);
        }

        default: {
            return value[value.kind];
        }
    }
}
