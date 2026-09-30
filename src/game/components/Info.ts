// Port of ru/alientransporter/components/Info.as

export class Info {
  static readonly className = 'Info';

  id: string;
  alias: string | null;

  constructor(aId: string, aAlias: string | null = null) {
    // super();
    this.id = aId;
    this.alias = aAlias;
  }
}
