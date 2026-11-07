/*
 * js-mdict - *.mdx/*.mdd interpreter
 * Copyright (C) 2026 terasum <terasum@163.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import MdictBase, { KeyWordItem, KeyInfoItem, MDictOptions } from './mdict-base';
import common from './utils';
import lzo1x from './lzo1x-wrapper';
import { unzlibSync as inflate } from 'fflate';
import { bytesToHex } from './byte-utils';
import type { Scanner } from './scanner';

export class Mdict extends MdictBase {

  /**
   * Construct an Mdict.
   *
   *  - `new Mdict(path, options?)`              — legacy API (Node only).
   *  - `new Mdict(scanner, name, options?)`     — explicit scanner.
   *
   * When the scanner is sync (or a path is given, which builds a sync
   * FileScanner internally), reading happens in the constructor. When the
   * scanner is async (e.g. {@link BlobScanner}), call `await mdict.init()`
   * before any lookup.
   */
  constructor(input: string | Scanner, nameOrOptions?: string | Partial<MDictOptions>, optionsArg?: Partial<MDictOptions>) {
    let name: string;
    let options: Partial<MDictOptions>;
    if (typeof input === 'string') {
      name = input;
      options = (typeof nameOrOptions === 'object' ? nameOrOptions : optionsArg) ?? {};
    } else {
      name = typeof nameOrOptions === 'string' ? nameOrOptions : (input as { name?: string }).name ?? 'unknown.mdx';
      options = optionsArg ?? (typeof nameOrOptions === 'object' ? nameOrOptions : {});
    }
    options = {
      passcode: options.passcode ?? '',
      debug: options.debug ?? false,
      resort: options.resort ?? true,
      isStripKey: options.isStripKey ?? true,
      isCaseSensitive: options.isCaseSensitive ?? true,
      encryptType: options.encryptType ?? -1,
      lazy: options.lazy ?? false,
    };
    const passcode = options.passcode || undefined;
    super(input as string | Scanner, name, passcode, options);
  }



  /**
   * lookupKeyInfoItem lookup the `keyInfoItem`
   * the `keyInfoItem` contains key-word record block location: recordStartOffset
   * the `recordStartOffset` should indicate the unpacked record data relative offset
   * @param word the target word phrase
   */
  lookupKeyBlockByWord(word: string, isAssociate: boolean = false): KeyWordItem | undefined {
    // const keyBlockInfoId = this.lookupKeyInfoByWord(word);
    // if (keyBlockInfoId < 0) {
    //   return undefined;
    // }

    // TODO: if the this.list length parse too slow, can decode by below code
    // const list = this.lookupPartialKeyBlockListByKeyInfoId(keyInfoId);
    const list = this.keywordList;
    // binary search
    let left = 0;
    let right = list.length - 1;
    let mid = 0;

    while (left <= right) {
      mid = left + ((right - left) >> 1);

      const compRes = this.comp(word, list[mid]!.keyText);
      if (compRes > 0) {
        left = mid + 1;
      } else if (compRes == 0) {
        break;
      } else {
        right = mid - 1;
      }
    }

    if (!list[mid] || this.comp(word, list[mid]!.keyText) != 0) {
      if (!isAssociate) {
        return undefined;
      }
    }

    return list[mid];
  }

  /**
   * locate the record meaning buffer by `keyListItem`
   * the `KeyBlockItem.recordStartOffset` should indicate the record block info location
   * use the record block info, we can get the `recordBuffer`, then we need decrypt and decompress
   * use decompressed `recordBuffer` we can get the total block which contains meanings
   * then, use:
   *  const start = item.recordStartOffset - recordBlockInfo.unpackAccumulatorOffset;
   *  const end = item.recordEndOffset - recordBlockInfo.unpackAccumulatorOffset;
   *  the finally meaning's buffer is `unpackRecordBlockBuff[start, end]`
   * @param item
   */
  /**
   * Returns the raw record bytes for a key item.
   *
   * Sync when the scanner is sync, async otherwise. The TS overload exposes
   * the sync return type to preserve the legacy API; async-scanner callers
   * should `await`, which unwraps either kind correctly.
   */
  lookupRecordByKeyBlock(item: KeyWordItem): Uint8Array;
  lookupRecordByKeyBlock(item: KeyWordItem): Uint8Array | Promise<Uint8Array> {
    const recordBlockIndex = this.reduceRecordBlockInfo(item.recordStartOffset);
    const recordBlockInfo = this.recordInfoList[recordBlockIndex];
    if (!recordBlockInfo) {
      throw new Error(`recordBlockInfo[${recordBlockIndex}] is missing`);
    }
    const offset = this._recordBlockStartOffset + recordBlockInfo.packAccumulateOffset;
    const start = item.recordStartOffset - recordBlockInfo.unpackAccumulatorOffset;
    const end = item.recordEndOffset - recordBlockInfo.unpackAccumulatorOffset;
    const finish = (recordBuffer: Uint8Array): Uint8Array => {
      const unpacked = this.decompressBuff(recordBuffer, recordBlockInfo.unpackSize);
      return unpacked.slice(start, end);
    };
    const buf = this.scanner.readBuffer(offset, recordBlockInfo.packSize);
    return buf instanceof Promise ? buf.then(finish) : finish(buf);
  }


  /**
   * lookupPartialKeyInfoListById
   * decode key block by key block id, and we can get the partial key list
   * the key list just contains the partial key list
   * @param {number} keyInfoId key block id
   * @return {KeyWordItem[]}
   */
  lookupPartialKeyBlockListByKeyInfoId(keyInfoId: number): KeyWordItem[];
  lookupPartialKeyBlockListByKeyInfoId(keyInfoId: number): KeyWordItem[] | Promise<KeyWordItem[]> {
    const keyInfo = this.keyInfoList[keyInfoId];
    if (!keyInfo) {
      throw new Error(`keyInfoList[${keyInfoId}] is missing`);
    }
    const packSize = keyInfo.keyBlockPackSize;
    const unpackSize = keyInfo.keyBlockUnpackSize;
    const startOffset = keyInfo.keyBlockPackAccumulator + this._keyBlockStartOffset;
    const finish = (keyBlockPackedBuff: Uint8Array): KeyWordItem[] => {
      const keyBlock = this.unpackKeyBlock(keyBlockPackedBuff, unpackSize);
      return this.splitKeyBlock(keyBlock, keyInfoId);
    };
    const buf = this.scanner.readBuffer(startOffset, packSize);
    return buf instanceof Promise ? buf.then(finish) : finish(buf);
  }


  /**
   * lookupInfoBlock reduce word find the nearest key block
   * @param {string} word searching phrase
   * @param keyInfoList
   */
  lookupKeyInfoByWord(word: string, keyInfoList?: KeyInfoItem[]): number {
    const list = keyInfoList ? keyInfoList : this.keyInfoList;

    let left = 0;
    let right = list.length - 1;
    let mid = 0;

    // when compare the word, the uppercase words are less than lowercase words
    // so we compare with the greater symbol is wrong, we need to use the `common.wordCompare` function
    while (left <= right) {
      mid = left + ((right - left) >> 1);
      const item = list[mid]!;
      if (this.comp(word, item.firstKey) >= 0 &&
        this.comp(word, item.lastKey) <= 0) {
        return mid;
      } else if (this.comp(word, item.lastKey) >= 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return -1;
  }


  private decompressBuff(recordBuffer: Uint8Array, unpackSize: number) {
    // decompress
    // 4 bytes: compression type
    const rbCompTypeHex = bytesToHex(recordBuffer, 4);
    // record_block stores the final record data
    let unpackRecordBlockBuff: Uint8Array = new Uint8Array(recordBuffer.length);

    // TODO: igore adler32 offset
    // Note: here ignore the checksum part
    // bytes: adler32 checksum of decompressed record block
    // adler32 = unpack('>I', record_block_compressed[4:8])[0]
    if (rbCompTypeHex === '00000000') {
      unpackRecordBlockBuff = recordBuffer.slice(8);
    } else {
      // decrypt
      let blockBufDecrypted: Uint8Array | null = null;
      // if encrypt type == 1, the record block was encrypted
      if (this.meta.encrypt === 1 /* || (this.meta.ext == "mdd" && this.meta.encrypt === 2 ) */) {
        blockBufDecrypted = common.mdxDecrypt(recordBuffer);
      } else {
        blockBufDecrypted = recordBuffer.subarray(8, recordBuffer.length);
      }

      // decompress
      if (rbCompTypeHex === '01000000') {
        unpackRecordBlockBuff = lzo1x.decompress(blockBufDecrypted, unpackSize, 1308672);
      } else if (rbCompTypeHex === '02000000') {
        // zlib decompress
        unpackRecordBlockBuff = inflate(blockBufDecrypted);
      }
    }
    return unpackRecordBlockBuff;
  }


  /**
   * find record which record start locate
   * @param {number} recordStart record start offset
   */
  private reduceRecordBlockInfo(recordStart: number): number {
    let left = 0;
    let right = this.recordInfoList.length - 1;
    let mid = 0;
    while (left <= right) {
      mid = left + ((right - left) >> 1);
      if (recordStart >= this.recordInfoList[mid]!.unpackAccumulatorOffset) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return left - 1;
  }

  public close() {
    this.scanner.close();
    this.keywordList = [];
    this.keyInfoList = [];
    this.recordInfoList = [];
  }

}

/**
 * 经过一系列测试, 发现mdx格式的文件存在较大的词语排序问题，存在如下情况：
 * 1. 大小写的问题 比如 a-zA-Z 和 aA-zZ 这种并存的情况
 * 2. 多语言的情况，存在英文和汉字比较大小的情况一般情况下 英文应当排在汉字前面
 * 3. 小语种的情况
 * 上述的这些情况都有可能出现，无法通过字典头中的设置实现排序，所以无法通过内部的keyInfoList进行快速索引，
 * 在现代计算机的性能条件下，直接遍历全部词条也可得到较好的效果，因此目前采用的策略是全部读取词条，内部排序
 *
 */
export default Mdict;
