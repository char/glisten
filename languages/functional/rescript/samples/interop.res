@module("node:fs")
external readFile: string => string = "readFileSync"
@send external push: (array<'a>, 'a) => int = "push"
@val external version: string = "version"

let values = [0xFF, 0b101, 1_000n]
let ratio = 1.5e3 +. 2.0
let letter = '\n'
let message = sql`select * from people where name = ${user.name}`
let foreign = %raw("({value: 42})")
%%raw(`console.log("ready")`)
let nested = `answer: ${if ready { `${1 + 2}` } else { "wait" }}`
