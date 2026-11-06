extends Node

const MASK := 0b1010_0110
const COLOR := 0xFF_88_33
const TITLE := "A \"quoted\" value"
const REGEX := r"\d+\.\d+"
const LABEL := &"player"
const TARGET := ^"World/Player"
const DETAILS := """First line
Second line with # not a comment
"""
var scores: Array[int] = [1_000, 1e3, 2.5]

func describe() -> String:
	## This is a documentation comment.
	return TITLE + \
		str(scores.size())
