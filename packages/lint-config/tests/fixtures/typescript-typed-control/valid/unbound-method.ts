export class Holder {
  value = 1
  read = (): number => this.value
}
export const read = new Holder().read
