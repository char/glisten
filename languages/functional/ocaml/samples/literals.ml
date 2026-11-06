#!/usr/bin/env ocaml
#use "topfind";;
(* Nested (* comment *) with a quoted "*)" and a char '*' inside. *)
let raw = {tag|One |other} two *) " \n |tag}
let empty = {|ordinary |wrong} literal|}
let chars = ['a'; '\n'; '\123'; '\x41']
let values = [0xffl; 0o77L; 0b10_01n; 1_234; 1.25e-3; 0x1.fp3]
let poly : [ `Red | `Blue of int ] = `Blue 42
let read ?default ~name:label = label |> String.trim
let run = [%extension payload] [@@warning "-3"]
