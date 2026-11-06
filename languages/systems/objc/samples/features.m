#import <Foundation/Foundation.h>
@import Foundation;

void demo(id object) {
    __weak id weakObject = object;
    NSArray<NSString *> *items = @[@"one", @"two"];
    NSDictionary *values = @{@"count": @42, @"ready": @YES};
    SEL selector = @selector(greet:prefix:);
    id result = [[object builder] item:@"x" other:@(1 + 2)];
    void (^block)(int) = ^(int x) { NSLog(@"%d", x); };
    @try { [object performSelector:selector]; }
    @catch (NSException *exception) { @throw exception; }
    @finally { @autoreleasepool { block(1); } }
    if (@available(macOS 12, *)) { NSLog(@"%@", values); }
    if (weakObject != nil && result != Nil) { NSLog(@"%@", items); }
}
