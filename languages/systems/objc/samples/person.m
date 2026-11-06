#import "person.h"

@implementation Person
@synthesize name = _name;
- (instancetype)initWithName:(NSString *)name {
    self = [super init];
    if (self) { _name = [name copy]; }
    return self;
}
- (NSString *)greet:(NSString *)name prefix:(NSString *)prefix {
    return [NSString stringWithFormat:@"%@ %@", prefix, name];
}
@end
