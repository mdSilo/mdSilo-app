// modified from https://github.com/landakram/micromark-extension-wiki-link/blob/master/src/index.js

const codes = {
  horizontalTab: -2,
  virtualSpace: -1,
  nul: 0,
  eof: null,
  space: 32
}

function markdownLineEndingOrSpace (code) {
  return code < codes.nul || code === codes.space;
}

function markdownLineEnding (code) {
  return code < codes.horizontalTab;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function tag (opts = {}) {
  
  const startMarker = '#';
  const endMarker = ' ';

  function tokenize (effects, ok, nok) {
    var data;
    
    var startMarkerCursor = 0;
    var endMarkerCursor = 0;

    return start;

    function start (code) {
      if (code !== startMarker.charCodeAt(startMarkerCursor)) return nok(code);

      effects.enter('tag');
      effects.enter('tagMarker');

      return consumeStart(code);
    }

    function consumeStart (code) {
      if (startMarkerCursor === startMarker.length) {
        effects.exit('tagMarker');
        return consumeData(code);
      }

      if (code !== startMarker.charCodeAt(startMarkerCursor)) {
        return nok(code);
      }

      effects.consume(code);
      startMarkerCursor++;

      return consumeStart;
    }

    function consumeData (code) {
      if (markdownLineEnding(code) || code === codes.eof) {
        return nok(code);
      }

      effects.enter('tagData');
      effects.enter('tagTarget');
      return consumeTarget(code);
    }

    function consumeTarget (code) {
      if (code === endMarker.charCodeAt(endMarkerCursor)) {
        if (!data) return nok(code);
        effects.exit('tagTarget');
        effects.exit('tagData');
        effects.enter('tagMarker');
        return consumeEnd(code);
      }

      if (markdownLineEnding(code) || code === codes.eof) {
        return nok(code);
      }

      if (!markdownLineEndingOrSpace(code)) {
        data = true;
      }

      effects.consume(code);

      return consumeTarget;
    }


    function consumeEnd (code) {
      if (endMarkerCursor === endMarker.length) {
        effects.exit('tagMarker');
        effects.exit('tag');
        return ok(code);
      }

      if (code !== endMarker.charCodeAt(endMarkerCursor)) {
        return nok(code);
      }

      effects.consume(code);
      endMarkerCursor++;

      return consumeEnd;
    }
  }

  var call = { tokenize: tokenize };

  return {
    text: { 35: call } // hash `#`
  }
}

export { tag as syntax };
