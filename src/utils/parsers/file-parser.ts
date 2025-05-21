import { proto } from '@hashgraph/proto';
import { Long } from '@hashgraph/sdk';
import {
  FileCreateData,
  FileAppendData,
  FileUpdateData,
  FileDeleteData,
} from '../transaction-parser-types';
import { parseKey } from './parser-utils';
import { Buffer } from 'buffer';

export class FileParser {
  static parseFileCreate(
    body: proto.IFileCreateTransactionBody
  ): FileCreateData | undefined {
    if (!body) return undefined;
    const data: FileCreateData = {};
    if (body.expirationTime?.seconds) {
      data.expirationTime = `${Long.fromValue(
        body.expirationTime.seconds
      ).toString()}.${body.expirationTime.nanos}`;
    }
    if (body.keys) {
      data.keys = parseKey({ keyList: body.keys });
    }
    if (body.contents) {
      data.contents = Buffer.from(body.contents).toString('base64');
    }
    if (body.memo) {
      data.memo = body.memo;
    }
    return data;
  }

  static parseFileAppend(
    body: proto.IFileAppendTransactionBody
  ): FileAppendData | undefined {
    if (!body) return undefined;
    const data: FileAppendData = {};
    if (body.fileID) {
      data.fileId = `${body.fileID.shardNum ?? 0}.${
        body.fileID.realmNum ?? 0
      }.${body.fileID.fileNum ?? 0}`;
    }
    if (body.contents) {
      data.contents = Buffer.from(body.contents).toString('base64');
    }
    return data;
  }

  static parseFileUpdate(
    body: proto.IFileUpdateTransactionBody
  ): FileUpdateData | undefined {
    if (!body) return undefined;
    const data: FileUpdateData = {};
    if (body.fileID) {
      data.fileId = `${body.fileID.shardNum ?? 0}.${
        body.fileID.realmNum ?? 0
      }.${body.fileID.fileNum ?? 0}`;
    }
    if (body.expirationTime?.seconds) {
      data.expirationTime = `${Long.fromValue(
        body.expirationTime.seconds
      ).toString()}.${body.expirationTime.nanos}`;
    }
    if (body.keys) {
      data.keys = parseKey({ keyList: body.keys });
    }
    if (body.contents) {
      data.contents = Buffer.from(body.contents).toString('base64');
    }
    if (body.memo?.value !== undefined) {
      data.memo = body.memo.value;
    }
    return data;
  }

  static parseFileDelete(
    body: proto.IFileDeleteTransactionBody
  ): FileDeleteData | undefined {
    if (!body) return undefined;
    const data: FileDeleteData = {};
    if (body.fileID) {
      data.fileId = `${body.fileID.shardNum ?? 0}.${
        body.fileID.realmNum ?? 0
      }.${body.fileID.fileNum ?? 0}`;
    }
    return data;
  }
}
