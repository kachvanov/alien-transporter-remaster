// Port of ru/alientransporter/components/IActionComponent.as

export interface IActionComponent {
  call(aName: string): void;
  isActive: boolean;
}
