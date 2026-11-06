# frozen_string_literal: true
module Orchard
  class Basket
    attr_accessor :items
    def initialize(items = [])
      @items = items
    end

    def self.empty? = true
    def []=(index, value)
      @items[index] = value
    end

    def describe(prefix: "fruit")
      "#{prefix}: #{@items.map { |item| item.name }.join(', ')}"
    end
  end
end
