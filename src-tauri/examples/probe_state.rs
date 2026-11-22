fn main() {
    println!("runtimes={:?}", packwright_lib::launcher_java::runtime_java_list().map(|v| v.len()));
    println!("instances={:?}", packwright_lib::launcher::launcher_instances().map(|v| v.iter().map(|i| i.name.clone()).collect::<Vec<_>>()));
}
