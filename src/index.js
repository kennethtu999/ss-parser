import fs from 'fs';
import async from 'async';
import _ from 'lodash';
import checksum from 'checksum';
import recursive from 'recursive-readdir';

import { parseContents, normalizeTrigger } from './parseContents';

// Whenever a breaking change occurs, update this version number and the corresponding
// supported version number in SuperScript
const VERSION_NUMBER = 1;

const parseFile = function parseFile(fileName, factSystem, callback) {
  fs.readFile(fileName, 'utf-8', (err, file) => {
    if (err) {
      console.error(`Error reading file: ${err}`);
    }
    parseContents(file, factSystem, callback);
  });
};

// A path of files to load
// Cache is a key:sum of files
const loadDirectory = function loadDirectory(path, options, callback) {
  if (_.isFunction(options)) {
    callback = options;
    options = {};
  }

  // Doesn't matter if this is null, we just decide not to use facts in wordnet expansion
  const factSystem = options.factSystem;
  const cache = options.cache || {};

  const startTime = new Date().getTime();

  recursive(path, (err, files) => {
    if (err && err.code === 'ENOTDIR') {
      files = [path];
    } else if (err) {
      console.error(err);
    }

    const checksums = {};
    const itor = (file, next) => {
      if (file.match(/\.(ss)$/i)) {
        checksum.file(file, (err, sum) => {
          if (err) {
            next(err);
          }

          checksums[file] = sum;
          if (cache[file]) {
            if (cache[file] !== sum) {
              next(null, true);
            } else {
              next(null, false);
            }
          } else {
            next(null, true);
          }
        });
      } else {
        next(null, false);
      }
    };

    // Filters out files that have been cached already
    async.filter(files, itor, (err, filesToLoad) => {
      async.map(filesToLoad, (fileName, callback) => {
        parseFile(fileName, factSystem, callback);
      }, (err, res) => {
        if (err) {
          console.error(err);
        }

        let topics = {};
        let gambits = {};
        let replies = {};

        for (let i = 0; i < res.length; i++) {
          topics = _.merge(topics, res[i].topics);
          gambits = _.merge(gambits, res[i].gambits);
          replies = _.merge(replies, res[i].replies);
        }

        const data = {
          topics,
          gambits,
          replies,
          checksums,
          version: VERSION_NUMBER,
        };

        const endTime = new Date().getTime();
        const topicCount = Object.keys(topics).length;
        const gambitsCount = Object.keys(gambits).length;
        const repliesCount = Object.keys(replies).length;

        console.log(`Time to Process: ${(endTime - startTime) / 1000} seconds`);
        // console.log("Number of topics %s parsed.", topicCount);
        // console.log("Number of gambits %s parsed.", gambitsCount);
        // console.log("Number of replies %s parsed.", repliesCount);

        if (topicCount === 0 && gambitsCount === 0 && repliesCount === 0) {
          callback(null, {});
        } else {
          callback(null, data);
        }
      });
    });
  });
};

export default {
  normalizeTrigger,
  parseFile,
  parseContents,
  loadDirectory,
};
