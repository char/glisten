port module Ports exposing (Message(..), notify, update)

import Json.Encode as Encode


port notify : Encode.Value -> Cmd msg


type Message
    = Send String
    | Ignore


update : Message -> Cmd msg
update message =
    case message of
        Send text ->
            let
                payload =
                    Encode.string text
            in
            notify payload

        Ignore ->
            Cmd.none
