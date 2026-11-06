#!/usr/bin/env groovy
/** A Groovydoc comment. */
@groovy.transform.Immutable
class Message {
  String name
}

def name = 'Ada'
def greeting = "Hello $name, ${name.toUpperCase()}!"
def literal = '$name ${notInterpolated}'
def block = """first $name
${[a: 1, b: 2].a} last"""
def plain = '''not $interpolated
still literal'''
def pattern = /\w+\/$name/
def path = $/home$/${name}$/$$file/$
def quotient = 12 / 3
def matcher = name =~ /A.*/
def exactly = name ==~ /Ada/
def score = (1..5).collect { n -> n * 2 }
def range = 0..<10
def comparison = 1 <=> 2
def fallback = person?.name ?: 'unknown'
def all = people*.name
println "Hi ${greeting}"
