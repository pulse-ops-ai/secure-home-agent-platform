export class Holder {
  #used = 1
  read(): number {
    return this.#used
  }
}
