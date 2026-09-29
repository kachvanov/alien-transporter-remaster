// Port of ru/antkarlov/anthill/utils/AntFormat.as

/** AS3 `String.substr(startIndex, len)`: negative start counts from the end. */
function substr(s: string, start: number, len?: number): string {
  if (start < 0) {
    start = Math.max(0, s.length + start);
  }
  return len === undefined ? s.slice(start) : s.slice(start, start + len);
}

export class AntFormat {
  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  static formatNumber(aValue: unknown, aMaxDecimals = 2, aForceDecimals = true, aSiStyle = false): string {
    aMaxDecimals = aMaxDecimals | 0; // aMaxDecimals:int
    aForceDecimals = aMaxDecimals == 0 ? false : aForceDecimals;
    let i = 0; // :int
    const inc = Math.pow(10, aMaxDecimals);
    const str = String(Math.round(inc * Number(aValue)) / inc);
    const hasSep = str.indexOf('.') == -1;
    const sep = (hasSep ? str.length : str.indexOf('.')) | 0; // :int
    let ret = (hasSep && !aForceDecimals ? '' : aSiStyle ? ',' : '.') + substr(str, sep + 1);

    if (aForceDecimals) {
      for (let j = 0; j <= aMaxDecimals - (str.length - (hasSep ? sep - 1 : sep)); j++) {
        ret += '0';
      }
    }

    while (i + 3 < (substr(str, 0, 1) == '-' ? sep - 1 : sep)) {
      ret = (aSiStyle ? '.' : ',') + substr(str, sep - (i += 3), 3) + ret;
    }

    return substr(str, 0, sep - i) + ret;
  }

  static formatString(aFormat: string, ...args: unknown[]): string {
    let i = 0; // :int
    const n = args.length | 0; // :int
    while (i < n) {
      aFormat = aFormat.replace(new RegExp('\\{' + i + '\\}', 'g'), String(args[i]));
      i++;
    }
    return aFormat;
  }

  static formatCommas(aValue: { toString(): string }): string {
    let numString = aValue.toString();
    let res = '';
    while (numString.length > 3) {
      const chunk = substr(numString, -3);
      numString = substr(numString, 0, numString.length - 3);
      res = ',' + chunk + res;
    }

    if (numString.length > 0) {
      res = numString + res;
    }

    return res;
  }

  static formatSize(aSize: number): string {
    if (aSize >= 1073741824) {
      aSize = aSize / 1073741824;
      return aSize.toFixed(2) + ' Gb';
    } else if (aSize >= 1048576) {
      aSize = aSize / 1048576;
      return aSize.toFixed(2) + ' Mb';
    } else if (aSize >= 1024) {
      aSize = aSize / 1024;
      return aSize.toFixed(2) + ' Kb';
    } else {
      return aSize.toFixed(0) + ' B';
    }
  }

  static formatTime(aValue: number, aShowMS = false): string {
    aValue = aValue | 0; // aValue:int
    const hours = (aValue / (1000 * 60 * 60)) | 0; // :int
    const minutes = ((aValue % (1000 * 60 * 60)) / (1000 * 60)) | 0; // :int
    const seconds = (((aValue % (1000 * 60 * 60)) % (1000 * 60)) / 1000) | 0; // :int
    const ms = (aValue % 10) | 0; // :int

    const zeroHour = hours < 10 ? '0' : '';
    const zeroSec = seconds < 10 ? '0' : '';
    const zeroMin = minutes < 10 ? '0' : '';

    if (aShowMS) {
      return AntFormat.formatString(
        '{0}:{1}:{2}.{3}',
        zeroHour + hours.toString(),
        zeroMin + minutes.toString(),
        zeroSec + seconds.toString(),
        ms,
      );
    } else {
      return AntFormat.formatString(
        '{0}:{1}:{2}',
        zeroHour + hours.toString(),
        zeroMin + minutes.toString(),
        zeroSec + seconds.toString(),
      );
    }
  }
}
