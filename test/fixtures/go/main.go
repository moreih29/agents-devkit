package main

import "fmt"

func greet(name string) string {
	return fmt.Sprintf("Hello, %s!", name)
}

func add(a int, b int) int {
	return a + b
}

func main() {
	fmt.Println(greet("Lattice"))
	fmt.Println(add(1, 2))
}
