// STUB(T2.7): stand-in for ru/alientransporter/texts/Text.as.
// T2.7 ports the real class (texts from texts.json) and replaces this file. Same public functions;
// extract() gives the "%id%" placeholder of the original for an unknown id.

export class Text {
  static lang: string | null = null;

  private static _data: Record<string, string> = {};

  static init(): void {
    Text._data = {};
  }

  static extract(aId: string): string {
    return Object.prototype.hasOwnProperty.call(Text._data, aId) ? Text._data[aId]! : '%' + aId + '%';
  }
}
