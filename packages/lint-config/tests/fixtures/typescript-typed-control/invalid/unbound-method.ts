export class Holder {
  value = 1
  read(): number {
    return this.value
  }
}
export const read = new Holder().read
