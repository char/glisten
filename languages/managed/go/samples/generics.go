package main

import (
    "fmt"
    "strings"
)

type Item[T comparable] struct {
    Value T `json:"value"`
    Count int `json:"count,omitempty"`
}

type Store[T comparable] struct {
    items map[T]int
}

func NewStore[T comparable]() *Store[T] {
    return &Store[T]{items: make(map[T]int)}
}

func (s *Store[T]) Add(value T) {
    s.items[value]++
}

func (s *Store[T]) Items() []Item[T] {
    result := make([]Item[T], 0, len(s.items))
    for value, count := range s.items {
        result = append(result, Item[T]{Value: value, Count: count})
    }
    return result
}

func main() {
    store := NewStore[string]()
    for _, word := range strings.Fields("red blue red") {
        store.Add(word)
    }
    for _, item := range store.Items() {
        fmt.Printf("%s: %d\n", item.Value, item.Count)
    }
}
